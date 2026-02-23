import type { StateValue } from './session.types';

export interface WorkflowContext {
    userId: number;
    reply(text: string): Promise<void>;
    replyFormatted(text: string): Promise<void>;
    replySilent(text: string): Promise<void>;
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
