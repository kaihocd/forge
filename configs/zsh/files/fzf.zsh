# Appearance
typeset -ga _FORGE_FZF_STYLE=(
  '--height=60%'
  '--layout=reverse'
  '--style=minimal'
  '--border=horizontal'
  '--border-label-pos=3'
  '--input-border=bottom'
  '--prompt=> '
  '--pointer=> '
  '--marker='
  '--no-multi'
  '--bind=ctrl-j:accept'
  '--bind=ctrl-d:half-page-down'
  '--bind=ctrl-u:half-page-up'
  '--info=inline-right'
  '--scrollbar=┊┊'
  '--color=bg:-1,bg+:-1,fg:-1,fg+:15:bold'
  '--color=border:8,input-border:8,info:8,gutter:-1'
  '--color=label:12:bold,input-label:12:bold'
  '--color=prompt:12,pointer:12:bold,hl:12,hl+:12:bold'
)

_forge_fzf_opts() {
  local label=$1
  shift

  local -a opts=(
    "${_FORGE_FZF_STYLE[@]}"
    "--border-label= $label "
    "$@"
  )

  # Quote each option before joining; quoting the array as a whole escapes the
  # separators and makes fzf treat all following options as one argument.
  print -r -- ${(j: :)${(@q)opts}}
}

# File search: Ctrl-T
FZF_CTRL_T_COMMAND='fd --type f --exclude .git; fd --type f --hidden --exclude .git --full-path "(^|/)\."'
FZF_CTRL_T_OPTS=$(
  _forge_fzf_opts Files \
    '--preview=bat --color=always --style=numbers --line-range=:500 -- {}' \
    '--preview-window=right,60%,border-left,<100(down,50%,border-top)' \
    '--bind=ctrl-/:toggle-preview' \
    '--bind=ctrl-f:preview-half-page-down' \
    '--bind=ctrl-b:preview-half-page-up'
)

# History search: Ctrl-R (Tab selects entries; Ctrl-X permanently deletes them)
FZF_CTRL_R_OPTS=$(
  _forge_fzf_opts History \
    '--multi' \
    '--marker=* ' \
    '--bind=enter:clear-multi+accept,ctrl-j:clear-multi+accept'
)

# Directory search: Ctrl-G
export _ZO_FZF_OPTS=$(_forge_fzf_opts Directories)

# Load fzf's shell integration, but disable its Alt-C walker in favor of Ctrl-G.
FZF_ALT_C_COMMAND=''
source <(fzf --zsh)

# Persistent history
#
# Zsh exposes its in-memory history as read-only. Track deleted event numbers so
# the current shell hides them immediately after the persistent file is updated.
typeset -gA _FORGE_DELETED_HISTORY_EVENTS

_forge_history_record_command() {
  local record=$1
  setopt localoptions extendedglob

  # SHARE_HISTORY writes records as `: timestamp:duration;command` and escapes
  # embedded newlines with a trailing backslash.
  record=${record#': '<->:<->';'}
  record=${record%$'\n'}
  REPLY=${record//$'\\\n'/$'\n'}
}

# Permanently remove history events in one locked rewrite.
#
# The event number identifies the in-memory entry, while the exact command text
# identifies its newest match in $HISTFILE. The rewrite preserves timestamps,
# multiline encoding, file permissions, and concurrent Zsh history writes.
_forge_delete_history_events() {
  local lock_fd line record event command
  local delete_status=1 remove_at=0 all_found=1 i
  local -a records retained events commands remove_indices

  (( $# > 0 && $# % 2 == 0 )) || return 1
  while (( $# > 0 )); do
    events+=("$1")
    commands+=("$2")
    shift 2
  done

  [[ -n "$HISTFILE" && -f "$HISTFILE" ]] || return 1
  zmodload zsh/system || return 1

  # Use the same fcntl locking strategy as Zsh and rewrite the locked inode in
  # place, preventing concurrent shells from appending to a replaced inode.
  if ! zsystem flock -t 5 -f lock_fd "$HISTFILE"; then
    return 1
  fi

  {
    # Zsh escapes embedded newlines with a trailing backslash. If the command
    # already has one there, the history file contains two backslashes.
    while IFS= read -r line || [[ -n $line ]]; do
      record+="$line"$'\n'
      [[ $line == *\\ ]] && continue
      records+=("$record")
      record=
    done < "$HISTFILE"
    [[ -n $record ]] && records+=("$record")

    # Event numbers are process-local, so match each command against the newest
    # remaining exact record. Validate every target before changing the file.
    for (( i = 1; i <= ${#events}; i++ )); do
      command=${commands[$i]}
      for (( remove_at = ${#records}; remove_at > 0; remove_at-- )); do
        (( ${remove_indices[(Ie)$remove_at]} )) && continue
        _forge_history_record_command "${records[$remove_at]}"
        [[ $REPLY == $command ]] && break
      done
      if (( remove_at == 0 )); then
        all_found=0
        break
      fi
      remove_indices+=("$remove_at")
    done

    if (( all_found )); then
      for (( i = 1; i <= ${#records}; i++ )); do
        (( ${remove_indices[(Ie)$i]} )) || retained+=("${records[$i]}")
      done
      print -rn -- ${(j::)retained} >| "$HISTFILE"
      delete_status=$?
    fi
  } always {
    zsystem flock -u $lock_fd
  }

  (( delete_status == 0 )) || return 1

  for event in "${events[@]}"; do
    _FORGE_DELETED_HISTORY_EVENTS[$event]=1
  done
}

_forge_history_candidates() {
  local event command display
  local -A seen

  for event command in "${(@kv)history}"; do
    (( ${+_FORGE_DELETED_HISTORY_EVENTS[$event]} )) && continue
    (( ${+seen[$command]} )) && continue
    seen[$command]=1
    display=${command//$'\n'/$'\n\t'}
    printf '%s\t%s\0' "$event" "$display"
  done
}

_forge_select_history() {
  local query=$1 fzf_opts
  local -a opts=(
    -n2..,..
    --scheme=history
    '--wrap-sign=\t↳ '
    --highlight-line
    "--query=$query"
    --read0
    --print-query
    --expect=ctrl-x
  )

  fzf_opts="$(__fzf_defaults "" "${(j: :)${(@q)opts}} ${FZF_CTRL_R_OPTS-}")"

  _forge_history_candidates |
    FZF_DEFAULT_OPTS="$fzf_opts" \
    FZF_DEFAULT_OPTS_FILE='' $(__fzfcmd)
}

fzf-history-widget() {
  local output query key selected line event ret
  local -a events delete_args
  local -a mbegin mend match
  setopt localoptions extendedglob no_aliases no_glob pipefail

  zmodload -F zsh/parameter p:history 2>/dev/null || return 1
  query=$LBUFFER

  while true; do
    output="$(_forge_select_history "$query")"
    ret=$?
    (( ret == 0 )) || break

    # With --print-query and --expect, fzf returns query, key, then selection.
    query=${output%%$'\n'*}
    output=${output#*$'\n'}
    key=${output%%$'\n'*}
    selected=${output#*$'\n'}

    if [[ -z $selected ]]; then
      LBUFFER=$query
      break
    fi

    events=()
    for line in "${(@f)selected}"; do
      if [[ $line == (#b)(<->)(#B)$'\t'* ]]; then
        events+=("${match[1]}")
      fi
    done

    if (( ${#events} == 0 )); then
      LBUFFER=$selected
      break
    fi

    if [[ $key == ctrl-x ]]; then
      delete_args=()
      for event in "${events[@]}"; do
        delete_args+=("$event" "${history[$event]}")
      done
      if ! _forge_delete_history_events "${delete_args[@]}"; then
        zle -M 'Could not delete selected history events'
        ret=1
        break
      fi
      continue
    fi

    event=${events[1]}
    BUFFER=${history[$event]}
    CURSOR=${#BUFFER}
    break
  done

  zle reset-prompt
  return $ret
}
zle -N fzf-history-widget

zoxide-cd-widget() {
  local dir ret

  dir="$(zoxide query --interactive)"
  ret=$?

  if (( ret == 0 )) && [[ -n $dir ]]; then
    BUFFER="builtin cd -- ${(q)dir:a}"
    CURSOR=${#BUFFER}
  fi

  zle reset-prompt
  return $ret
}
zle -N zoxide-cd-widget

_forge_bind_fzf_widgets() {
  # Fuzzy search is available only while editing in vi insert mode.
  bindkey -M viins '^R' fzf-history-widget
  bindkey -M viins '^G' zoxide-cd-widget

  # fzf binds all keymaps by default; restore native non-insert behavior.
  bindkey -M emacs '^R' history-incremental-search-backward
  bindkey -M emacs '^G' send-break
  bindkey -M emacs '^T' transpose-chars
  bindkey -M vicmd '^R' redo
  bindkey -M vicmd '^G' list-expand
  bindkey -M vicmd '^T' undefined-key
}

_forge_bind_fzf_widgets
