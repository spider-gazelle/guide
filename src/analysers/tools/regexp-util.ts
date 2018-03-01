import * as R from 'ramda';
import { Location } from './analyser-lib';

/**
 * Generator for every occurrence of a regex within a string.
 */
export function* execIter(re: RegExp, str: string): IterableIterator<RegExpExecArray> {
    const match = re.exec(str);
    if (match != null) {
        yield match;
        yield* execAll(re, str);
    }
}

/**
 * Create a list of all regex match objects found within a string.
 */
export const execAll: (re: RegExp, srt: string) => RegExpExecArray[]
    = R.pipe(execIter, Array.from);

/**
 * Map a regex match object to a [line, column] tuple of the match location.
 */
export const locate = (match: RegExpExecArray) =>
    R.map(
        f => f(match.input, match.index),
        [Location.getLine, Location.getLineColumn]
    ) as [number, number];
