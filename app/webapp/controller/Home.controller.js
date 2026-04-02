sap.ui.define([
    "./BaseController"
], function (BaseController) {
    "use strict";

    return BaseController.extend("com.abics.casestudy.controller.Home", {
        onInit: function () {
        },

        onNavigateToProducts: function () {
            this.navTo("products");
        },

        onNavigateToSuppliers: function () {
            this.navTo("suppliers");
        }
    });
});
