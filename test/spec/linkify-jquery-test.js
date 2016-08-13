var $, doc, testContainer, jsdom;
const applyLinkify = require(`${__base}linkify-jquery`).default;
const htmlOptions = require('./html/options');

try {
	doc = document;
	$ = require('jquery'); // should be available through Browserify
} catch (e) {
	doc = null;
	$ = null;
}

describe('linkify-jquery', function () {

	// Sometimes jQuery is slow to load
	this.timeout(10000);

	/**
		Set up the JavaScript document and the element for it
		This code allows testing on Node.js and on Browser environments
	*/
	before(function (done) {

		function onDoc($, doc) {

			doc.body.innerHTML = htmlOptions.extra;

			// Add the linkify plugin to jQuery
			applyLinkify($, doc);
			$(doc).trigger('ready');

			testContainer = doc.createElement('div');
			testContainer.id = 'linkify-jquery-test-container';

			doc.body.appendChild(testContainer);
			done();
		}

		if (doc) { return onDoc($, doc); }
		// no document element, use a virtual dom to test

		jsdom = require('jsdom');
		jsdom.env(
			'<html><head><title>Linkify Test</title></head><body></body></html>',
			['http://code.jquery.com/jquery.js'],
			function (errors, window) {
				if (errors) { throw errors; }
				doc = window.document;
				$ = window.$; // this is pretty weird
				return onDoc(window.$, window.document);
			}
		);
	});

	// Make sure we start out with a fresh DOM every time
	beforeEach(() => testContainer.innerHTML = htmlOptions.original);

	// This works but is inconsistent across browsers
	it('Works with the DOM Data API', () => {
		expect($('header').first().html()).to.be.eql(
			'Have a link to:<br><a href="https://github.com" class="linkified" target="_blank">github.com</a>!'
		);
		expect($('#linkify-test-div').html()).to.be.eql(
			'Another <i href="mailto:test@gmail.com" class="test-class" ' +
			'target="_parent">test@gmail.com</i> email as well as a <i '+
			'href="http://t.co" class="test-class" target="_parent">' +
			'http://t.co</i> link.'
		);
	});

	it('Works with default options', () => {
		var $container = $('#linkify-jquery-test-container');
		expect(($container.length)).to.be.eql(1);
		var result = $container.linkify();
		// `should` is not defined on jQuery objects
		expect((result === $container)).to.be.ok; // should return the same element
		expect($container.html()).to.be.oneOf(htmlOptions.linkified);
	});

	it('Works with overriden options (general)', () => {
		var $container = $('#linkify-jquery-test-container');
		expect(($container.length)).to.be.eql(1);
		var result = $container.linkify(htmlOptions.altOptions);
		// `should` is not defined on jQuery objects
		expect((result === $container)).to.be.ok; // should return the same element
		expect($container.html()).to.be.oneOf(htmlOptions.linkifiedAlt);
	});

	it('Works with overriden options (validate)', () => {
		var $container = $('#linkify-jquery-test-container');
		expect(($container.length)).to.be.eql(1);
		var result = $container.linkify(htmlOptions.validateOptions);
		// `should` is not defined on jQuery objects
		expect((result === $container)).to.be.ok; // should return the same element
		expect($container.html()).to.be.oneOf(htmlOptions.linkifiedValidate);
	});
});
