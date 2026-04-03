import React from 'react'
import { Box } from 'ink'
import { ServiceCard, ServiceCardProps } from './ServiceCard'

export interface ServiceGridProps {
  services: ServiceCardProps[]
  selectedIndex?: number
  columns?: number
}

export const ServiceGrid: React.FC<ServiceGridProps> = ({
  services,
  selectedIndex = 0,
  columns = 4,
}) => {
  const rows: ServiceCardProps[][] = []
  for (let i = 0; i < services.length; i += columns) {
    rows.push(services.slice(i, i + columns))
  }

  return (
    <Box flexDirection="column" gap={1}>
      {rows.map((row, rowIndex) => (
        <Box key={rowIndex} gap={1}>
          {row.map((service, colIndex) => {
            const globalIndex = rowIndex * columns + colIndex
            return (
              <ServiceCard
                key={service.name}
                {...service}
                selected={globalIndex === selectedIndex}
              />
            )
          })}
        </Box>
      ))}
    </Box>
  )
}
