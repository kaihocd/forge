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
  '--info=inline-right'
  '--no-scrollbar'
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
    '--bind=ctrl-/:toggle-preview'
)

# History search: Ctrl-R (Ctrl-X permanently deletes the selected event)
FZF_CTRL_R_OPTS=$(_forge_fzf_opts History)

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

# Permanently remove one history event.
#
# The event number identifies the in-memory entry, while the exact command text
# identifies its newest match in $HISTFILE. The rewrite preserves timestamps,
# multiline encoding, file permissions, and concurrent Zsh history writes.
_forge_delete_history_event() {
  local event=$1 command=$2 lock_fd line record trailing
  local delete_status=1 remove_at=0
  local -a records

  [[ -n "$HISTFILE" && -f "$HISTFILE" ]] || return 1
  zmodload zsh/system || return 1

  # Use the same fcntl locking strategy as Zsh and rewrite the locked inode in
  # place, preventing concurrent shells from appending to a replaced inode.
  if ! zsystem flock -t 5 -f lock_fd "$HISTFILE"; then
    return 1
  fi

  {
    # An odd number of trailing backslashes means the next physical line belongs
    # to the same multiline history event.
    while IFS= read -r line || [[ -n $line ]]; do
      record+="$line"$'\n'
      trailing=${line##*[^\\]}
      (( ${#trailing} % 2 )) && continue
      records+=("$record")
      record=
    done < "$HISTFILE"
    [[ -n $record ]] && records+=("$record")

    # Event numbers are process-local, so remove the newest exact command match.
    for (( remove_at = ${#records}; remove_at > 0; remove_at-- )); do
      _forge_history_record_command "${records[$remove_at]}"
      [[ $REPLY == $command ]] && break
    done

    if (( remove_at > 0 )); then
      records[$remove_at]=()
      print -rn -- ${(j::)records} >| "$HISTFILE"
      delete_status=$?
    fi
  } always {
    zsystem flock -u $lock_fd
  }

  (( delete_status == 0 )) || return 1

  _FORGE_DELETED_HISTORY_EVENTS[$event]=1
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
  local output query key selected event ret
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

    if [[ $selected == (#b)(<->)(#B)$'\t'* ]]; then
      event=${match[1]}
    else
      LBUFFER=$selected
      break
    fi

    if [[ $key == ctrl-x ]]; then
      if ! _forge_delete_history_event "$event" "${history[$event]}"; then
        zle -M 'Could not delete history event'
        ret=1
        break
      fi
      continue
    fi

    BUFFER=${history[$event]}
    CURSOR=${#BUFFER}
    break
  done

  zle reset-prompt
  return $ret
}
zle -N fzf-history-widget

zoxide-cd-widget() {
  local dir="$(zoxide query --interactive)"
  [[ -n "$dir" ]] || return

  zle push-line
  BUFFER="builtin cd -- ${(q)dir:a}"
  zle accept-line
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
