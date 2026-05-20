import type { StateValue } from './session.types';

export interface WorkflowContext {
    userId: number;
    reply(text: string, fallback?: string): Promise<void>;
    replyFormatted(text: string, fallback?: string): Promise<void>;
    replySilent(text: string, fallback?: string): Promise<void>;
    replyDocument(content: string, filename: string, fallback?: string): Promise<void>;
}

export interface IncomingDocument {
    fileName: string;
    fileSize: number;
    fetchContent(): Promise<string>;
}

export interface StepHandler {
    readonly state: StateValue;
    handleText(ctx: WorkflowContext, text: string): Promise<void>;
    handleDocument?(ctx: WorkflowContext, document: IncomingDocument): Promise<void>;
}
