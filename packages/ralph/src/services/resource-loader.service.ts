import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';

@Injectable()
export class ResourceLoaderService {
  private getResourcePath(filename: string): string {
    return path.resolve(__dirname, '../../resources', filename);
  }

  async loadResource(filename: string): Promise<string> {
    return readFile(this.getResourcePath(filename), 'utf-8');
  }
}
