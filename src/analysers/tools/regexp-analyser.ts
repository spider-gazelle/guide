import * as R from 'ramda';
import { Analyser, AnalyserResult, AnalyserMessage } from './analyser-lib';
import { execAll, locate } from './regexp-util';

/**
 * Tuple representation a parser definition as RegExp to search for along with
 * and info message string to be shown when matched.
 */
export type ParserDef = [RegExp, string];

/**
 * Tuple used to represent an Analyser rule. Composed of a rule name with a
 * collection of parser definitions that will cause the a message to be emitted
 * for the rule.
 */
export type RegExpAnalyserRule = [string, ParserDef[]];

/**
 * Pre-parser for creating AnlyzerMessages. Provides partial application of
 * arguments and insertion of context into info message.
 */
const message = (type: string, text: string) =>
    (occurance: RegExpExecArray) => {
        const [line, column] = locate(occurance);
        const info = `"${occurance[0]}" ${text}`;
        return new AnalyserMessage(type, info, line, column);
    };

/**
 * Build an parser which once provided with the rule name, and a ParserDef will
 * parse content to list of AnalyserMessages containing any violations found.
 */
const createParser = (rule: string) =>
    (parser: ParserDef) =>
    (content: string) =>
    R.map(message(rule, parser[1]), execAll(parser[0], content));

/**
 * Map a single rule definition to a list of Parsers.
 */
const createParsersForRule = (rule: RegExpAnalyserRule) =>
    R.map(createParser(rule[0]), rule[1]);

/**
 * Flatmap a rule set to all of the Parsers it defines.
 */
const createParsers = R.chain(createParsersForRule);

/**
 * Parse a body of content for occurrences of an arbitrary set of rules and
 * return a list of AnalysersMessages containing any violations.
 */
const parse = (content: string, rules: RegExpAnalyserRule[]) => {
    const parsers = createParsers(rules);
    return R.chain(p => p(content), parsers);
};

/**
 * Base class for creating analysers which parse a body of text for matches
 * against a RegExp and emits rule violations for each match.
 */
export abstract class RegExpAnalyser implements Analyser {
    public constructor(public readonly rules: RegExpAnalyserRule[]) {
    }

    public analyze(content: string) {
        const result = new AnalyserResult();
        result.messages = parse(content, this.rules);
        return result;
    }
}
