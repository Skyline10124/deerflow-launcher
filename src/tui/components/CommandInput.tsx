import React, { useState, useCallback } from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'

export interface CommandInputProps {
  onSubmit: (command: string) => void
  placeholder?: string
  prefix?: string
  history?: string[]
}

export const CommandInput: React.FC<CommandInputProps> = ({
  onSubmit,
  placeholder = 'Enter command...',
  prefix = '>',
  history = [],
}) => {
  const [command, setCommand] = useState('')
  const [historyIndex, setHistoryIndex] = useState(-1)

  const handleSubmit = useCallback((value: string) => {
    if (value.trim()) {
      onSubmit(value.trim())
      setCommand('')
      setHistoryIndex(-1)
    }
  }, [onSubmit])

  useInput((input, key) => {
    if (key.upArrow && history.length > 0) {
      if (historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1
        setHistoryIndex(newIndex)
        setCommand(history[history.length - 1 - newIndex])
      }
    } else if (key.downArrow && historyIndex > 0) {
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      setCommand(history[history.length - 1 - newIndex])
    } else if (key.downArrow && historyIndex === 0) {
      setHistoryIndex(-1)
      setCommand('')
    }
  })

  return (
    <Box>
      <Text color="cyan" bold>{prefix} </Text>
      <TextInput
        value={command}
        onChange={setCommand}
        onSubmit={handleSubmit}
        placeholder={placeholder}
        showCursor={true}
      />
    </Box>
  )
}
