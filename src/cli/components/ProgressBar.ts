import ora, { Ora } from 'ora';
import chalk from 'chalk';

export interface TaskStep {
  name: string;
  action: () => Promise<void>;
  skip?: () => boolean;
}

export class MultiStepProgress {
  private steps: TaskStep[];
  private current?: Ora;
  private completed: string[] = [];
  private failed: Array<{ name: string; error: Error }> = [];

  constructor(steps: TaskStep[]) {
    this.steps = steps;
  }

  async run(): Promise<{ success: boolean; completed: string[]; failed: Array<{ name: string; error: Error }> }> {
    console.log(chalk.bold(`\nRunning ${this.steps.length} tasks...\n`));

    for (const step of this.steps) {
      if (step.skip?.()) {
        console.log(chalk.gray(`⏭  ${step.name} (skipped)`));
        continue;
      }

      this.current = ora({
        text: step.name,
        spinner: 'dots',
        color: 'cyan'
      }).start();

      try {
        await step.action();
        this.current.succeed(chalk.green(step.name));
        this.completed.push(step.name);
      } catch (error) {
        this.current.fail(chalk.red(step.name));
        this.failed.push({
          name: step.name,
          error: error instanceof Error ? error : new Error(String(error))
        });
      }
    }

    console.log('');
    if (this.failed.length === 0) {
      console.log(chalk.green(`✓ All ${this.completed.length} tasks completed\n`));
    } else {
      console.log(chalk.yellow(`⚠ ${this.completed.length} succeeded, ${this.failed.length} failed\n`));
      for (const fail of this.failed) {
        console.log(chalk.red(`  ✗ ${fail.name}: ${fail.error.message}`));
      }
      console.log('');
    }

    return {
      success: this.failed.length === 0,
      completed: this.completed,
      failed: this.failed
    };
  }
}

export function createSpinner(text: string): Ora {
  return ora({
    text,
    spinner: 'dots',
    color: 'cyan'
  });
}
