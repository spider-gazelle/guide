export interface Hook {
    /**
     * Called when the script starts running, only trigger once, no arguments.
     */
    init(handler: () => void): void;

    /**
     * Invoked each time before parsing the Markdown file.
     */
    beforeEach(handler: (content: string) => string ): void;

    /**
     * Invoked each time after the Markdown file is parsed.
     *
     * Call `next(html)` when task is done.
     */
    afterEach(handler: (html: string, next: (html: string) => void) => void): void;

    /**
     * Invoked each time after the data is fully loaded.
     */
    doneEach(handler: () => void): void;

    /**
     * Called after initial completion. Only trigger once.
     */
    mounted(handler: () => void): void;

    /**
     * Called after initial load.
     */
    ready(handler: () => void): void;
}

export type Plugin = (hook: Hook) => void;
