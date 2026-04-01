sap.ui.define(function () {
	"use strict";

	return {
		name: "QUnit test suite for the UI5 Application: com.abics.casestudy",
		defaults: {
			page: "ui5://test-resources/com/abics/casestudy/Test.qunit.html?testsuite={suite}&test={name}",
			qunit: {
				version: 2
			},
			sinon: {
				version: 1
			},
			ui5: {
				language: "EN",
				theme: "sap_horizon"
			},
			coverage: {
				only: "com/abics/casestudy/",
				never: "test-resources/com/abics/casestudy/"
			},
			loader: {
				paths: {
					"com/abics/casestudy": "../"
				}
			}
		},
		tests: {
			"unit/unitTests": {
				title: "Unit tests for com.abics.casestudy"
			},
			"integration/opaTests": {
				title: "Integration tests for com.abics.casestudy"
			}
		}
	};
});
