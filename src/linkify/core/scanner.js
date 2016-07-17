/**
	The scanner provides an interface that takes a string of text as input, and
	outputs an array of tokens instances that can be used for easy URL parsing.

	@module linkify
	@submodule scanner
	@main scanner
*/

import {text as TOKENS} from './tokens';
import {CharacterState as State, makeStartState, stateify} from './state';

const tlds = __TLDS__; // macro, see gulpfile.js

const NUM = '0123456789'.split('');
const ALPHANUM = '0123456789abcdefghijklmnopqrstuvwxyz'.split('');
const WHITESPACE = [' ', '\f', '\r', '\t', '\v']; // excluding line breaks
const COLON = ':';

let
domainStates = [], // states that jump to DOMAIN on /[a-z0-9]/
makeState = (tokenClass) => new State(tokenClass);

const // Frequently used tokens
T_DOMAIN	= TOKENS.DOMAIN,
T_LOCALHOST	= TOKENS.LOCALHOST,
T_NUM		= TOKENS.NUM,
T_PROTOCOL	= TOKENS.PROTOCOL,
T_TLD		= TOKENS.TLD,
T_WS		= TOKENS.WS;

const // Frequently used states
S_START			= makeStartState(State, false),
S_NUM			= makeState(T_NUM),
S_DOMAIN		= makeState(T_DOMAIN),
S_DOMAIN_HYPHEN	= makeState(), // domain followed by 1 or more hyphen characters
S_WS			= makeState(T_WS);

// States for special URL symbols
S_START
.on('@', makeState(TOKENS.AT))
.on('.', makeState(TOKENS.DOT))
.on('+', makeState(TOKENS.PLUS))
.on('#', makeState(TOKENS.POUND))
.on('?', makeState(TOKENS.QUERY))
.on('/', makeState(TOKENS.SLASH))
.on(COLON, makeState(TOKENS.COLON))
.on('{', makeState(TOKENS.OPENBRACE))
.on('[', makeState(TOKENS.OPENBRACKET))
.on('(', makeState(TOKENS.OPENPAREN))
.on('}', makeState(TOKENS.CLOSEBRACE))
.on(']', makeState(TOKENS.CLOSEBRACKET))
.on(')', makeState(TOKENS.CLOSEPAREN))
.on([',', ';', '!', '"'], makeState(TOKENS.PUNCTUATION));

// Whitespace jumps
// Tokens of only non-newline whitespace are arbitrarily long
S_START
.on('\n', makeState(TOKENS.NL))
.on(WHITESPACE, S_WS);

// If any whitespace except newline, more whitespace!
S_WS.on(WHITESPACE, S_WS);

// Generates states for top-level domains
// Note that this is most accurate when tlds are in alphabetical order
for (let i = 0; i < tlds.length; i++) {
	let newStates = stateify(tlds[i], S_START, T_TLD, T_DOMAIN);
	domainStates.push.apply(domainStates, newStates);
}

// Collect the states generated by different protocls
let
partialProtocolFileStates	= stateify('file', S_START, T_DOMAIN, T_DOMAIN),
partialProtocolFtpStates	= stateify('ftp', S_START, T_DOMAIN, T_DOMAIN),
partialProtocolHttpStates	= stateify('http', S_START, T_DOMAIN, T_DOMAIN);

// Add the states to the array of DOMAINeric states
domainStates.push.apply(domainStates, partialProtocolFileStates);
domainStates.push.apply(domainStates, partialProtocolFtpStates);
domainStates.push.apply(domainStates, partialProtocolHttpStates);

let // Protocol states
S_PROTOCOL_FILE		= partialProtocolFileStates.pop(),
S_PROTOCOL_FTP		= partialProtocolFtpStates.pop(),
S_PROTOCOL_HTTP		= partialProtocolHttpStates.pop(),
S_PROTOCOL_SECURE	= makeState(T_DOMAIN),
S_FULL_PROTOCOL		= makeState(T_PROTOCOL); // Full protocol ends with COLON

// Secure protocols (end with 's')
S_PROTOCOL_FTP
.on('s', S_PROTOCOL_SECURE)
.on(COLON, S_FULL_PROTOCOL);

S_PROTOCOL_HTTP
.on('s', S_PROTOCOL_SECURE)
.on(COLON, S_FULL_PROTOCOL);

domainStates.push(S_PROTOCOL_SECURE);

// Become protocol tokens after a COLON
S_PROTOCOL_FILE.on(COLON, S_FULL_PROTOCOL);
S_PROTOCOL_SECURE.on(COLON, S_FULL_PROTOCOL);

// Localhost
let partialLocalhostStates = stateify('localhost', S_START, T_LOCALHOST, T_DOMAIN);
domainStates.push.apply(domainStates, partialLocalhostStates);

// Everything else
// DOMAINs make more DOMAINs
// Number and character transitions
S_START.on(NUM, S_NUM);
S_NUM
.on('-', S_DOMAIN_HYPHEN)
.on(NUM, S_NUM)
.on(ALPHANUM, S_DOMAIN); // number becomes DOMAIN

S_DOMAIN
.on('-', S_DOMAIN_HYPHEN)
.on(ALPHANUM, S_DOMAIN);

// All the generated states should have a jump to DOMAIN
for (let i = 0; i < domainStates.length; i++) {
	domainStates[i]
	.on('-', S_DOMAIN_HYPHEN)
	.on(ALPHANUM, S_DOMAIN);
}

S_DOMAIN_HYPHEN
.on('-', S_DOMAIN_HYPHEN)
.on(NUM, S_DOMAIN)
.on(ALPHANUM, S_DOMAIN);

// Set default transition
S_START.d = makeState(TOKENS.SYM);

/**
	Given a string, returns an array of TOKEN instances representing the
	composition of that string.

	@method run
	@param {String} str Input string to scan
	@return {Array} Array of TOKEN instances
*/
let run = function (str) {

	// The state machine only looks at lowercase strings.
	// This selective `toLowerCase` is used because lowercasing the entire
	// string causes the length and character position to vary in some in some
	// non-English strings. This happens only on V8-based runtimes.
	let lowerStr = str.replace(/[A-Z]/g, (c) => c.toLowerCase());
	let len = str.length;
	let tokens = []; // return value

	var cursor = 0;

	// Tokenize the string
	while (cursor < len) {

		let
		state = S_START,
		secondState = null,
		nextState = null,
		tokenLength = 0,
		latestAccepting = null,
		sinceAccepts = -1;

		while (cursor < len && (nextState = state.next(lowerStr[cursor]))) {
			secondState = null;
			state = nextState;

			// Keep track of the latest accepting state
			if (state.accepts()) {
				sinceAccepts = 0;
				latestAccepting = state;
			} else if (sinceAccepts >= 0) {
				sinceAccepts++;
			}

			tokenLength++;
			cursor++;
		}

		if (sinceAccepts < 0) continue; // Should never happen

		// Roll back to the latest accepting state
		cursor -= sinceAccepts;
		tokenLength -= sinceAccepts;

		// Get the class for the new token
		let TOKEN = latestAccepting.emit(); // Current token class

		// No more jumps, just make a new token
		tokens.push(new TOKEN(str.substr(cursor - tokenLength, tokenLength)));
	}

	return tokens;
};

let start = S_START;
export {State, TOKENS, run, start};
