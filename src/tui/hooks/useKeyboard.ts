import { useCallback } from 'react'
import { useInput } from 'ink'

export interface KeyBindings {
  up?: () => void
  down?: () => void
  left?: () => void
  right?: () => void
  enter?: () => void
  escape?: () => void
  [key: string]: (() => void) | undefined
}

export interface UseKeyboardOptions {
  enabled?: boolean
}

export function useKeyboard(bindings: KeyBindings, options: UseKeyboardOptions = {}): void {
  const { enabled = true } = options

  useInput(useCallback((input, key) => {
    if (!enabled) return

    if (key.upArrow && bindings.up) {
      bindings.up()
    } else if (key.downArrow && bindings.down) {
      bindings.down()
    } else if (key.leftArrow && bindings.left) {
      bindings.left()
    } else if (key.rightArrow && bindings.right) {
      bindings.right()
    } else if (key.return && bindings.enter) {
      bindings.enter()
    } else if (key.escape && bindings.escape) {
      bindings.escape()
    } else {
      const binding = bindings[input.toLowerCase()]
      if (binding) binding()
    }
  }, [bindings, enabled]))
}
