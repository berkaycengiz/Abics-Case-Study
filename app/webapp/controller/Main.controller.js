sap.ui.define(["./BaseController", "sap/m/MessageBox"], function (BaseController, MessageBox) {
	"use strict";

	return BaseController.extend("com.abics.casestudy.controller.Main", {
		sayHello: function () {
			MessageBox.show("Hello World!");
		}
	});
});
