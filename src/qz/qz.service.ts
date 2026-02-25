import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

type QzCredentials = {
  certificate: string;
  privateKey: string;
};

@Injectable()
export class QzService {
  private readonly logger = new Logger(QzService.name);
  private readonly certificatePath = join(
    process.cwd(),
    'keys',
    'digital-certificate.txt',
  );
  private readonly privateKeyPath = join(
    process.cwd(),
    'keys',
    'private-key.pem',
  );
  private cachedCredentials: QzCredentials | null = null;
  private loadingPromise: Promise<QzCredentials> | null = null;

  async getCertificate(): Promise<string> {
    const credentials = await this.getCredentials();
    return credentials.certificate;
  }

  async sign(data: string): Promise<string> {
    const credentials = await this.getCredentials();

    try {
      const signer = createSign('RSA-SHA512');
      signer.update(data, 'utf8');
      signer.end();
      return signer.sign(credentials.privateKey, 'base64');
    } catch (error) {
      this.logger.error(
        'Failed to sign QZ payload with private key',
        this.getErrorStack(error),
      );
      throw new InternalServerErrorException(
        'No se pudo firmar el payload de QZ en el servidor',
      );
    }
  }

  private async getCredentials(): Promise<QzCredentials> {
    if (this.cachedCredentials) {
      return this.cachedCredentials;
    }

    if (!this.loadingPromise) {
      this.loadingPromise = this.loadCredentials();
    }

    try {
      const credentials = await this.loadingPromise;
      this.cachedCredentials = credentials;
      return credentials;
    } finally {
      this.loadingPromise = null;
    }
  }

  private async loadCredentials(): Promise<QzCredentials> {
    try {
      const [certificate, privateKey] = await Promise.all([
        readFile(this.certificatePath, 'utf8'),
        readFile(this.privateKeyPath, 'utf8'),
      ]);

      return { certificate, privateKey };
    } catch (error) {
      const details = this.getErrorMessage(error);
      this.logger.error(
        `Unable to load QZ signing files from ${this.certificatePath} and ${this.privateKeyPath}: ${details}`,
        this.getErrorStack(error),
      );
      throw new InternalServerErrorException(
        'No se pudieron cargar los archivos de firma QZ en el servidor',
      );
    }
  }

  private getErrorMessage(error: unknown): string {
    if (!error || typeof error !== 'object' || !('message' in error)) {
      return 'Unknown error';
    }

    return String((error as { message?: string }).message);
  }

  private getErrorStack(error: unknown): string | undefined {
    if (!error || typeof error !== 'object' || !('stack' in error)) {
      return undefined;
    }

    return String((error as { stack?: string }).stack);
  }
}
