sap.ui.define(["./BaseController"], function (BaseController) {
	"use strict";

	return BaseController.extend("com.abics.casestudy.controller.App", {
		onInit: function () {
			this.getView().addStyleClass(this.getOwnerComponent().getContentDensityClass());
		},

		onSideNavButtonPress: function () {
            var oToolPage = this.byId("toolPage");
            var bSideExpanded = oToolPage.getSideExpanded();

            oToolPage.setSideExpanded(!bSideExpanded);
        },

        onNavItemSelect: function (oEvent) {
            var sKey = oEvent.getSource().getKey(); 
            this.getOwnerComponent().getRouter().navTo(sKey);
        }
	});
});
