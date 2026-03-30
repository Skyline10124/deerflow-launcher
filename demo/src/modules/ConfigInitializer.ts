import * as fs from 'fs';
import * as path from 'path';
import { Logger, getLogger } from './Logger';
import { ConfigInitResult, CONFIG_FILE_MAPPINGS, ErrorCodes } from '../types';

export class ConfigInitializer {
  private logger: Logger;
  private deerflowPath: string;

  constructor(deerflowPath: string) {
    this.deerflowPath = deerflowPath;
    this.logger = getLogger('ConfigInit');
  }

  async initialize(): Promise<ConfigInitResult> {
    this.logger.info('Initializing configurations...');

    const result: ConfigInitResult = {
      success: true,
      created: [],
      skipped: [],
      failed: []
    };

    for (const mapping of CONFIG_FILE_MAPPINGS) {
      const templatePath = path.join(this.deerflowPath, mapping.template);
      const targetPath = path.join(this.deerflowPath, mapping.target);

      const processResult = await this.processConfigFile(templatePath, targetPath, mapping.target);
      
      if (processResult === 'created') {
        result.created.push(mapping.target);
      } else if (processResult === 'skipped') {
        result.skipped.push(mapping.target);
      } else {
        result.failed.push(mapping.target);
        result.success = false;
      }
    }

    if (result.created.length > 0) {
      this.logger.info(`Created: ${result.created.join(', ')}`);
    }
    if (result.skipped.length > 0) {
      this.logger.warn(`Skipped (already exist): ${result.skipped.join(', ')}`);
    }
    if (result.failed.length > 0) {
      this.logger.error(`Failed: ${result.failed.join(', ')}`);
    }

    return result;
  }

  private async processConfigFile(
    templatePath: string,
    targetPath: string,
    targetName: string
  ): Promise<'created' | 'skipped' | 'failed'> {
    if (fs.existsSync(targetPath)) {
      this.logger.debug(`${targetName} already exists, skipping`);
      return 'skipped';
    }

    if (!fs.existsSync(templatePath)) {
      this.logger.error(`Template file not found: ${templatePath}`);
      return 'failed';
    }

    try {
      const content = fs.readFileSync(templatePath, 'utf-8');
      fs.writeFileSync(targetPath, content, 'utf-8');
      this.logger.info(`Created ${targetName} from template`);
      return 'created';
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create ${targetName}: ${errorMsg}`);
      return 'failed';
    }
  }

  validateDeerFlowPath(): boolean {
    if (!fs.existsSync(this.deerflowPath)) {
      this.logger.error(`DeerFlow path does not exist: ${this.deerflowPath}`);
      return false;
    }

    const requiredFiles = ['config.example.yaml', '.env.example'];
    for (const file of requiredFiles) {
      const filePath = path.join(this.deerflowPath, file);
      if (!fs.existsSync(filePath)) {
        this.logger.error(`Required file not found: ${file}`);
        this.logger.error('Please ensure DeerFlow repository is properly cloned');
        return false;
      }
    }

    return true;
  }
}
