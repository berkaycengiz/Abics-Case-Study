sap.ui.define([
	"sap/ui/core/mvc/Controller", 
	"sap/ui/core/UIComponent", 
	"sap/ui/core/routing/History",
	"sap/ui/export/Spreadsheet",
	"sap/ui/export/library"
], function (Controller, UIComponent, History, Spreadsheet, exportLibrary) {
	"use strict";

	const EdmType = exportLibrary.EdmType;

	return Controller.extend("com.abics.casestudy.controller.BaseController", {
		getRouter: function () {
			return UIComponent.getRouterFor(this);
		},

		getResourceBundle: function () {
			const oModel = this.getOwnerComponent().getModel("i18n");
			return oModel.getResourceBundle();
		},

		getModel: function (sName) {
			return this.getView().getModel(sName);
		},

		setModel: function (oModel, sName) {
			this.getView().setModel(oModel, sName);
			return this;
		},

		navTo: function (sName, oParameters, bReplace) {
			this.getRouter().navTo(sName, oParameters, undefined, bReplace);
		},

		onNavBack: function () {
			const sPreviousHash = History.getInstance().getPreviousHash();
			if (sPreviousHash !== undefined) {
				window.history.go(-1);
			} else {
				this.getRouter().navTo("main", {}, undefined, true);
			}
		},

		_exportTable: function (oTable, aColumns, sFileName) {
			const oBinding = oTable.getBinding("items");
			const oSettings = {
				workbook: { columns: aColumns },
				dataSource: oBinding,
				fileName: sFileName + ".xlsx",
				worker: false
			};

			const oSheet = new Spreadsheet(oSettings);
			oSheet.build().finally(function () {
				oSheet.destroy();
			});
		}
	});
});
