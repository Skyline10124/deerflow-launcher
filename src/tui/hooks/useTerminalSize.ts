import { useState, useEffect } from 'react'
import { TerminalSize } from '../types/index.js'

export interface UseTerminalSizeOptions {
  debounceMs?: number
}

export function useTerminalSize(options: UseTerminalSizeOptions = {}): TerminalSize {
  const { debounceMs = 100 } = options
  
  const [size, setSize] = useState<TerminalSize>({
    width: process.stdout.columns || 80,
    height: process.stdout.rows || 24,
  })

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null

    const handleResize = () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      
      timeoutId = setTimeout(() => {
        setSize({
          width: process.stdout.columns || 80,
          height: process.stdout.rows || 24,
        })
      }, debounceMs)
    }

    process.stdout.on('resize', handleResize)

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      process.stdout.off('resize', handleResize)
    }
  }, [debounceMs])

  return size
}
