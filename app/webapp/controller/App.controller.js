sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox"
], function (BaseController, JSONModel, MessageBox) {
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
			var oRouter = this.getOwnerComponent().getRouter();
			var oModel = this.getOwnerComponent().getModel();

			var bHasChanges = false;
			try {
				if (oModel && typeof oModel.hasPendingChanges === "function") {
					bHasChanges = oModel.hasPendingChanges("productsGroup") || oModel.hasPendingChanges("suppliersGroup");
				}
			} catch (e) {
				bHasChanges = false;
			}

			if (bHasChanges) {
				var sMessage = this.getOwnerComponent().getModel("i18n").getProperty("unsavedChanges");
				MessageBox.confirm(sMessage, {
					onClose: function (sAction) {
						if (sAction === MessageBox.Action.OK) {
							oModel.resetChanges("productsGroup");
							oModel.resetChanges("suppliersGroup");
							oRouter.navTo(sKey);
						}
					}
				});
			} else {
				oRouter.navTo(sKey);
			}
		}
	});
});
