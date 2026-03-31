import inquirer from 'inquirer';
import chalk from 'chalk';

export interface ConfirmOptions {
  message: string;
  default?: boolean;
  destructive?: boolean;
}

export async function confirm(options: ConfirmOptions): Promise<boolean> {
  const { confirmed } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirmed',
    message: options.destructive 
      ? chalk.red(options.message)
      : options.message,
    default: options.default ?? false
  }]);
  
  return confirmed;
}

export async function confirmDestructive(action: string): Promise<boolean> {
  return confirm({
    message: `This will ${action}. Are you sure?`,
    destructive: true
  });
}

export async function confirmAction(message: string): Promise<boolean> {
  return confirm({ message });
}
