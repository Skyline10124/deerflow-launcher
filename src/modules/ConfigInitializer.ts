import * as fs from 'fs';
import * as path from 'path';
import { Logger, getLogger } from './Logger';
import { ConfigInitResult, CONFIG_FILE_MAPPINGS, ErrorCodes } from '../types';

const NGINX_REQUIRED_DIRS = ['temp/client_body_temp', 'temp/proxy_temp', 'temp/fastcgi_temp', 'temp/uwsgi_temp', 'temp/scgi_temp'];

export class ConfigInitializer {
  private logger: Logger;
  private deerflowPath: string;
  private launcherPath: string;

  constructor(deerflowPath: string) {
    this.deerflowPath = deerflowPath;
    this.launcherPath = path.dirname(path.dirname(path.dirname(__dirname)));
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

    this.createNginxDirectories();

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

  private createNginxDirectories(): void {
    for (const dir of NGINX_REQUIRED_DIRS) {
      const dirPath = path.join(this.deerflowPath, dir);
      if (!fs.existsSync(dirPath)) {
        try {
          fs.mkdirSync(dirPath, { recursive: true });
          this.logger.debug(`Created nginx directory: ${dir}`);
        } catch (error) {
          this.logger.warn(`Failed to create nginx directory ${dir}: ${error}`);
        }
      }
    }
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
      let content = fs.readFileSync(templatePath, 'utf-8');
      
      if (targetName === 'nginx.conf') {
        const logDir = path.join(this.launcherPath, 'logs').replace(/\\/g, '/');
        content = content.replace(/logs\/nginx\.log/g, `${logDir}/nginx.log`);
        content = content.replace(/logs\/nginx-access\.log/g, `${logDir}/nginx.log`);
        content = content.replace(/logs\/nginx-error\.log/g, `${logDir}/nginx.log`);
        content = content.replace(/logs\/nginx\.pid/g, `${logDir}/nginx.pid`);
      }
      
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
