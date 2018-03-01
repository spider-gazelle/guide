// Type defs and mappings to components of the markdown-proofing package
// required for building custom analysers.

/* tslint:disable: variable-name */

export abstract class Analyser {
    public abstract analyze(content: string): AnalyserResult;
}

export interface AnalyserMessage {
    readonly type: string;
    readonly text: string;
    readonly line: number;
    readonly column: number;
}
export const AnalyserMessage: {
    new (type: string, text: string, line: number, column: number): AnalyserMessage;
} = require('markdown-proofing/lib/analyzer-message');

export interface AnalyserResult {
    messages: AnalyserMessage[];
    addMessage(type: string, text: string, line: number, column: number): void;
    getMessage(type: string): AnalyserMessage[] | null;
}
export const AnalyserResult: {
    new (): AnalyserResult;
} = require('markdown-proofing/lib/analyzer-result');

export const Location: {
    getLine(source: string, index: number): number;
    getLineColumn(source: string, index: number): number;
} = require('markdown-proofing/lib/location');
