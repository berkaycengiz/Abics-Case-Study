sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox"
], function (BaseController, JSONModel, MessageBox) {
	"use strict";

	return BaseController.extend("com.abics.casestudy.controller.App", {
		onInit: function () {
			this.getView().addStyleClass(this.getOwnerComponent().getContentDensityClass());

			const sSavedTheme = localStorage.getItem("appTheme") || "sap_horizon";
			const bIsDark = sSavedTheme === "sap_horizon_dark";
			sap.ui.getCore().applyTheme(sSavedTheme);

			const sSavedLang = localStorage.getItem("appLanguage");
			if (sSavedLang) {
				sap.ui.getCore().getConfiguration().setLanguage(sSavedLang);
			}

			var oAppModel = new JSONModel({ 
				selectedKey: "home",
				isDark: bIsDark
			});
			this.getView().setModel(oAppModel, "app");

			var oRouter = this.getOwnerComponent().getRouter();
			oRouter.attachRouteMatched(this._onRouteMatched, this);
		},

		onThemeToggle: function () {
			const oModel = this.getView().getModel("app");
			const bIsDark = oModel.getProperty("/isDark");
			const sNewTheme = bIsDark ? "sap_horizon" : "sap_horizon_dark";

			sap.ui.getCore().applyTheme(sNewTheme);
			localStorage.setItem("appTheme", sNewTheme);
			oModel.setProperty("/isDark", !bIsDark);
		},

        onLanguageToggle: function (oEvent) {
            const oButton = oEvent.getSource();
            if (!this._oLanguageSheet) {
                this._oLanguageSheet = new sap.m.ActionSheet({
                    title: "{i18n>switchLanguage}",
                    showCancelButton: true,
                    buttons: [
                        new sap.m.Button({
                            text: "{i18n>languageEN}",
                            icon: "sap-icon://flag",
                            press: function () { this._setLanguage("en"); }.bind(this)
                        }),
                        new sap.m.Button({
                            text: "{i18n>languageTR}",
                            icon: "sap-icon://flag",
                            press: function () { this._setLanguage("tr"); }.bind(this)
                        }),
                        new sap.m.Button({
                            text: "{i18n>languageDE}",
                            icon: "sap-icon://flag",
                            press: function () { this._setLanguage("de"); }.bind(this)
                        })
                    ]
                });
                this.getView().addDependent(this._oLanguageSheet);
            }
            this._oLanguageSheet.openBy(oButton);
        },

        _setLanguage: function (sLang) {
            sap.ui.getCore().getConfiguration().setLanguage(sLang);
            localStorage.setItem("appLanguage", sLang);
        },

		_onRouteMatched: function (oEvent) {
			var sRouteName = oEvent.getParameter("name");
			var sKey = sRouteName;

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
