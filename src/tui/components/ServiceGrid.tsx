import React from 'react';
import { Box, useInput } from 'ink';
import { ServiceCard } from './ServiceCard.js';
import { Service } from '../types/index.js';

interface ServiceGridProps {
  services: Service[];
  selectedIndex: number;
  isFocused: boolean;
  onNavigate: (direction: 'up' | 'down' | 'left' | 'right') => void;
  onServiceAction: (serviceId: string, action: 'start' | 'stop' | 'restart') => void;
}

export const ServiceGrid: React.FC<ServiceGridProps> = ({
  services,
  selectedIndex,
  isFocused,
  onNavigate,
  onServiceAction,
}) => {
  useInput((input, key) => {
    if (!isFocused) return;

    if (key.upArrow) onNavigate('up');
    if (key.downArrow) onNavigate('down');
    if (key.leftArrow) onNavigate('left');
    if (key.rightArrow) onNavigate('right');

    if (input === 's') {
      const service = services[selectedIndex];
      if (service) {
        const action = service.status === 'online' ? 'stop' : 'start';
        onServiceAction(service.id, action);
      }
    }
    if (input === 'r') {
      const service = services[selectedIndex];
      if (service) {
        onServiceAction(service.id, 'restart');
      }
    }
  });

  const row1 = services.slice(0, 2);
  const row2 = services.slice(2, 4);

  return (
    <Box flexDirection="column" gap={1}>
      <Box gap={1}>
        {row1.map((service, index) => (
          <ServiceCard
            key={service.id}
            service={service}
            isActive={selectedIndex === index}
            isFocused={isFocused}
          />
        ))}
      </Box>
      <Box gap={1}>
        {row2.map((service, index) => (
          <ServiceCard
            key={service.id}
            service={service}
            isActive={selectedIndex === index + 2}
            isFocused={isFocused}
          />
        ))}
      </Box>
    </Box>
  );
};
