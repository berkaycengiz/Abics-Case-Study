sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
	"use strict";

	return BaseController.extend("com.abics.casestudy.controller.App", {
		onInit: function () {
			this.getView().addStyleClass(this.getOwnerComponent().getContentDensityClass());

			var oAppModel = new JSONModel({ selectedKey: "home" });
			this.getView().setModel(oAppModel, "app");

			var oRouter = this.getOwnerComponent().getRouter();
			oRouter.attachRouteMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			var sRouteName = oEvent.getParameter("name");
			var sKey = sRouteName;

			if (sRouteName === "productsDetail") {
				sKey = "products";
			}

			this.getView().getModel("app").setProperty("/selectedKey", sKey);
		},

		onSideNavButtonPress: function () {
			var oToolPage = this.byId("toolPage");
			oToolPage.setSideExpanded(!oToolPage.getSideExpanded());
		},

		onNavItemSelect: function (oEvent) {
			var sKey = oEvent.getSource().getKey();
			this.getOwnerComponent().getRouter().navTo(sKey);
		}
	});
});
