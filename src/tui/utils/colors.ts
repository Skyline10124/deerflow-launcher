export const STATUS_COLORS = {
  ONLINE: 'green',
  OFFLINE: 'gray',
  STARTING: 'yellow',
  STOPPING: 'orange',
  ERROR: 'red',
  
  DEBUG: 'gray',
  INFO: 'white',
  WARN: 'yellow',
  ERROR_LOG: 'red',
  
  PRIMARY: 'cyan',
  SECONDARY: 'gray',
  BORDER: 'gray',
  HIGHLIGHT: 'cyan',
} as const

export type StatusColor = typeof STATUS_COLORS[keyof typeof STATUS_COLORS]
