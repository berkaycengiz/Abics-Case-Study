sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/f/library",
    "sap/base/strings/formatMessage"
], function (Controller, JSONModel, Filter, FilterOperator, Sorter, MessageBox, MessageToast, fioriLibrary, formatMessage) {
    "use strict";

    return Controller.extend("com.abics.casestudy.controller.Products", {
        onInit: function () {
            this._oUIModel = new JSONModel({
                layout: "OneColumn",
                count: 0,
                hasSelection: false,
                hasPendingChanges: false,
                hasActiveFilters: false,
                editingRows: [],
                allSelected: false,
                sortColumn: "createdAt",
                sortDescending: true,
                isInlineEditing: false
            });
            this.getView().setModel(this._oUIModel, "products");

            this._oODataModel = this.getOwnerComponent().getModel();

            this._oFilterDialog = null;
            this._oCsvDialog = null;

            this._aSorters = [];
            this._aFilters = [];
            this._aSearchFilters = [];
            this._aActiveFilterTokens = [];

            this._loadCurrencies();
            this._loadSuppliers();

            this._oODataModel.attachPropertyChange(this._onModelChange, this);

            // Reset inline edit state when navigating away from products
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.attachRouteMatched(this._onRouteChanged, this);
        },

        onExit: function () {
            this._oODataModel.detachPropertyChange(this._onModelChange, this);
            var oRouter = this.getOwnerComponent().getRouter();
            oRouter.detachRouteMatched(this._onRouteChanged, this);
        },

        _onRouteChanged: function (oEvent) {
            var sRouteName = oEvent.getParameter("name");
            if (sRouteName !== "products" && sRouteName !== "productsDetail") {
                // Leaving the products page — discard changes and exit edit mode
                if (this._oODataModel.hasPendingChanges("productsGroup")) {
                    this._oODataModel.resetChanges("productsGroup");
                }
                this._oUIModel.setProperty("/editingRows", []);
                this._onModelChange();
                this._oUIModel.refresh(true);
            }
        },

        _onModelChange: function () {
            const bHas = this._oODataModel.hasPendingChanges("productsGroup");
            const aEditingRows = this._oUIModel.getProperty("/editingRows") || [];
            this._oUIModel.setProperty("/hasPendingChanges", bHas || aEditingRows.length > 0);
            this._oUIModel.setProperty("/isInlineEditing", aEditingRows.length > 0);
        },

        _loadSuppliers: function () {
            const oListBinding = this._oODataModel.bindList("/Suppliers", null, [], [], {
                $select: "ID,name"
            });
            oListBinding.requestContexts(0, 500).then((aContexts) => {
                const aSuppliers = aContexts.map(c => c.getObject());
                this._oUIModel.setProperty("/suppliers", aSuppliers);

                // For filter dialog, prepend 'All Suppliers' option
                const aFilterSuppliers = [...aSuppliers];
                aFilterSuppliers.unshift({ ID: "", name: this._i18n("allSuppliers") });
                this._oUIModel.setProperty("/filterSuppliers", aFilterSuppliers);
            }).catch((oErr) => {
                console.error("Failed to load suppliers", oErr);
            });
        },

        _loadCurrencies: function () {
            const oListBinding = this._oODataModel.bindList("/Currencies", null, [], [], {
                $select: "code,name"
            });
            oListBinding.requestContexts(0, 500).then((aContexts) => {
                const aCurrencies = aContexts.map(c => c.getObject());
                this._oUIModel.setProperty("/currencies", aCurrencies);

                // For filter dialog, prepend 'All Currencies' option
                const aFilterCurrencies = [...aCurrencies];
                aFilterCurrencies.unshift({ code: "", name: this._i18n("allCurrencies") });
                this._oUIModel.setProperty("/filterCurrencies", aFilterCurrencies);
            }).catch((oErr) => {
                console.error("Failed to load currencies", oErr);
            });
        },

        _getTable: function () {
            var oTable = this.byId("productTable");
            if (!oTable) {
                // If not found in current view (e.g. called from Detail), search in Master view
                var oFCL = this._getFCL();
                if (oFCL) {
                    var aBeginPages = oFCL.getBeginColumnPages();
                    var oMasterView = aBeginPages && aBeginPages.length > 0 ? aBeginPages[0] : null;
                    if (oMasterView) {
                        oTable = oMasterView.byId("productTable");
                    }
                }
            }
            return oTable;
        },

        _getBinding: function () {
            return this._getTable().getBinding("items");
        },

        onSelectionChange: function () {
            const oTable = this._getTable();
            const aSelected = oTable.getSelectedItems();
            this._oUIModel.setProperty("/hasSelection", aSelected.length > 0);
        },

        onSelectAll: function (oEvent) {
            const bSelected = oEvent.getParameter("selected");
            const oTable = this._getTable();
            if (bSelected) {
                oTable.selectAll();
            } else {
                oTable.removeSelections(true);
            }
            this._oUIModel.setProperty("/hasSelection", bSelected);
        },

        onSearch: function (oEvent) {
            const sQuery = oEvent.getParameter("newValue").trim();
            if (sQuery) {
                this._aSearchFilters = [new Filter({
                    filters: [
                        new Filter({ path: "name", operator: FilterOperator.Contains, value1: sQuery, caseSensitive: false }),
                        new Filter({ path: "description", operator: FilterOperator.Contains, value1: sQuery, caseSensitive: false })
                    ],
                    and: false
                })];
            } else {
                this._aSearchFilters = [];
            }
            this._applyFilters();
        },

        onSort: function (oEvent) {
            const oBtn = oEvent.getSource();
            const sColumn = oBtn.data("column");
            const sCurrentSort = this._oUIModel.getProperty("/sortColumn");
            const bCurrentDesc = this._oUIModel.getProperty("/sortDescending");

            let sNewColumn = sColumn;
            let bNewDescending = false;
            let aSorters = [];

            if (sCurrentSort === sColumn) {
                if (!bCurrentDesc) {
                    // 2. State: Ascending -> Descending
                    bNewDescending = true;
                    aSorters = [new Sorter(sColumn, true)];
                } else {
                    // 3. State: Descending -> None (Clear Sort)
                    sNewColumn = "";
                    bNewDescending = false;
                    // Empty array lets OData V4 fall back to the XML default (createdAt desc)
                    aSorters = [];
                }
            } else {
                // 1. State: New Column -> Ascending
                bNewDescending = false;
                aSorters = [new Sorter(sColumn, false)];
            }

            this._oUIModel.setProperty("/sortColumn", sNewColumn);
            this._oUIModel.setProperty("/sortDescending", bNewDescending);

            this._aSorters = aSorters;
            this._getBinding().sort(this._aSorters);
        },

        onDataReceived: function () {
            this._updateCount();
        },

        _updateCount: function () {
            var oTable = this._getTable();
            if (oTable) {
                var iCount = oTable.getItems().length;
                this._oUIModel.setProperty("/count", iCount);
            }
        },

        onOpenFilterDialog: function () {
            if (!this._oFilterDialog) {
                this._oFilterDialog = sap.ui.xmlfragment(
                    this.getView().getId(),
                    "com.abics.casestudy.view.fragment.ProductsFilterDialog",
                    this
                );
                this.getView().addDependent(this._oFilterDialog);
            }

            this._oFilterDialog.open();
        },

        onFilterConfirm: function () {
            const aFilters = [];
            const aTokens = [];

            // Currency filter
            const oCurrSelect = this.byId("productCurrencyFilter");
            if (oCurrSelect && oCurrSelect.getSelectedKey()) {
                const sCurr = oCurrSelect.getSelectedKey();
                const sCurrText = oCurrSelect.getSelectedItem().getText();
                aFilters.push(new Filter("currency_code", FilterOperator.EQ, sCurr));
                aTokens.push({ key: "currency_code", text: this._i18n("currencyLabel") + ": " + sCurrText });
            }

            // Supplier filter
            const oSupplierSelect = this.byId("productSupplierFilter");
            if (oSupplierSelect && oSupplierSelect.getSelectedKey()) {
                const sSupp = oSupplierSelect.getSelectedKey();
                const sSuppName = oSupplierSelect.getSelectedItem().getText();
                aFilters.push(new Filter("supplier_ID", FilterOperator.EQ, sSupp));
                aTokens.push({ key: "supplier_ID", text: this._i18n("supplierLabel") + ": " + sSuppName });
            }

            // Price range filter
            const oPriceFrom = this.byId("productPriceFrom");
            const oPriceTo = this.byId("productPriceTo");
            var sPriceFromVal = oPriceFrom ? oPriceFrom.getValue() : "";
            var sPriceToVal = oPriceTo ? oPriceTo.getValue() : "";
            if (sPriceFromVal) {
                var fPriceFrom = parseFloat(sPriceFromVal);
                aFilters.push(new Filter("price", FilterOperator.GE, fPriceFrom));
            }
            if (sPriceToVal) {
                var fPriceTo = parseFloat(sPriceToVal);
                aFilters.push(new Filter("price", FilterOperator.LE, fPriceTo));
            }
            if (sPriceFromVal && sPriceToVal) {
                aTokens.push({ key: "price", text: this._i18n("priceRangeTemplate", [fPriceFrom, fPriceTo]) });
            } else if (sPriceFromVal) {
                aTokens.push({ key: "price", text: this._i18n("priceMin", [fPriceFrom]) });
            } else if (sPriceToVal) {
                aTokens.push({ key: "price", text: this._i18n("priceMax", [fPriceTo]) });
            }

            // Stock range filter
            const oStockFrom = this.byId("productStocksFrom");
            const oStockTo = this.byId("productStocksTo");
            var sStockFromVal = oStockFrom ? oStockFrom.getValue() : "";
            var sStockToVal = oStockTo ? oStockTo.getValue() : "";
            if (sStockFromVal) {
                var iStockFrom = parseInt(sStockFromVal, 10);
                aFilters.push(new Filter("stocks", FilterOperator.GE, iStockFrom));
            }
            if (sStockToVal) {
                var iStockTo = parseInt(sStockToVal, 10);
                aFilters.push(new Filter("stocks", FilterOperator.LE, iStockTo));
            }
            if (sStockFromVal && sStockToVal) {
                aTokens.push({ key: "stocks", text: this._i18n("stockRangeTemplate", [iStockFrom, iStockTo]) });
            } else if (sStockFromVal) {
                aTokens.push({ key: "stocks", text: this._i18n("stockMin", [iStockFrom]) });
            } else if (sStockToVal) {
                aTokens.push({ key: "stocks", text: this._i18n("stockMax", [iStockTo]) });
            }

            this._aFilters = aFilters;
            this._aActiveFilterTokens = aTokens;
            this._oUIModel.setProperty("/hasActiveFilters", aTokens.length > 0);
            this._renderFilterTokens(aTokens);
            this._applyFilters();
            this._oFilterDialog.close();
        },

        onFilterCancel: function () {
            this._oFilterDialog.close();
        },

        onClearAllFilters: function () {
            this._aFilters = [];
            this._aActiveFilterTokens = [];
            this._oUIModel.setProperty("/hasActiveFilters", false);
            this._renderFilterTokens([]);
            this._applyFilters();
        },

        _renderFilterTokens: function (aTokens) {
            const oTokensBox = this.byId("productFilterTokens");
            if (!oTokensBox) return;
            oTokensBox.destroyItems();
            aTokens.forEach(t => {
                oTokensBox.addItem(new sap.m.Token({ key: t.key, text: t.text, delete: this._onRemoveToken.bind(this) }));
            });
        },

        _onRemoveToken: function (oEvent) {
            const sKey = oEvent.getSource().getKey();
            this._aActiveFilterTokens = this._aActiveFilterTokens.filter(t => t.key !== sKey);
            this._aFilters = this._aFilters.filter(f => f.sPath !== sKey.replace("From", "").replace("To", "").replace("Min", ""));
            this._oUIModel.setProperty("/hasActiveFilters", this._aActiveFilterTokens.length > 0);
            this._renderFilterTokens(this._aActiveFilterTokens);
            this._applyFilters();
        },

        _applyFilters: function () {
            const aAllFilters = [...this._aSearchFilters, ...this._aFilters];
            if (aAllFilters.length > 0) {
                this._getBinding().filter(new Filter({ filters: aAllFilters, and: true }));
            } else {
                this._getBinding().filter([]);
            }
        },

        onAddRow: function () {
            const oBinding = this._getBinding();
            const sID = globalThis.crypto ? crypto.randomUUID() : Math.random().toString();
            const oContext = oBinding.create({
                ID: sID,
                name: "",
                description: "",
                price: 0,
                currency_code: "EUR",
                stocks: 0,
                supplier_ID: null
            }, false, false);

            const aEditingRows = this._oUIModel.getProperty("/editingRows") || [];
            this._oUIModel.setProperty("/editingRows", [...aEditingRows, sID]);
            this._onModelChange();
            this._updateCount();
            this._oUIModel.refresh(true);

            const oTable = this._getTable();
            oTable.scrollToIndex(0);
        },

        onEditRow: function (oEvent) {
            const oContext = oEvent.getSource().getBindingContext();
            if (!oContext) return;
            const sID = oContext.getProperty("ID");
            const aEditingRows = this._oUIModel.getProperty("/editingRows") || [];

            if (sID && !aEditingRows.includes(sID)) {
                this._oUIModel.setProperty("/editingRows", [...aEditingRows, sID]);
                this._onModelChange();
                this._oUIModel.refresh(true);
            }
        },

        onRowPress: function (oEvent) {
            console.log("[Products] onRowPress triggered!");
            const oSource = oEvent.getSource();
            let oContext = oSource.getBindingContext();

            // Sometime HBox/Button might not have direct context depending on UI5 version,
            // fallback to parent's binding context (ColumnListItem)
            if (!oContext && oSource.getParent) {
                const oParent = oSource.getParent();
                if (oParent && oParent.getBindingContext) {
                    oContext = oParent.getBindingContext();
                }
            }

            if (!oContext) {
                console.warn("[Products] No binding context found for clicked row.");
                return;
            }
            
            console.log("[Products] Context found:", oContext.getPath());

            const oFCL = this._getFCL();
            const oDetailView = this._getDetailView();

            if (oDetailView) {
                console.log("[Products] Refreshing Detail View binding...");
                // Just use the existing context from the table. 
                // OData V4 will automatically detect missing properties (like supplier/name) and fetch them smartly!
                oDetailView.setBindingContext(oContext);
            } else {
                console.error("[Products] Detail view not found by _getDetailView!");
            }

            if (oFCL) {
                console.log("[Products] Setting Layout to TwoColumnsBeginExpanded");
                oFCL.setLayout("TwoColumnsBeginExpanded");
            } else {
                console.error("[Products] FlexibleColumnLayout not found by _getFCL!");
            }
        },

        onOpenEditDialog: function (oEvent) {
            const oDetailView = this._getDetailView();
            const oContext = oDetailView ? oDetailView.getBindingContext() : null;
            
            if (!oContext) {
                MessageToast.show(this._i18n("noProductSelected"));
                return;
            }

            if (!this._oEditDialog) {
                this._oEditDialog = sap.ui.xmlfragment(
                    this.getView().getId(),
                    "com.abics.casestudy.view.fragment.ProductEditDialog",
                    this
                );
                // We add it to the view as a dependent so it inherits its model
                this.getView().addDependent(this._oEditDialog);
            }
            
            // Create buffer model for isolated editing
            var oData = oContext.getObject();
            var oEditModel = new JSONModel({
                name: oData.name || "",
                description: oData.description || "",
                price: oData.price || 0,
                currency_code: oData.currency_code || "",
                stocks: oData.stocks || 0,
                supplier_ID: oData.supplier_ID || null
            });
            this._oEditDialog.setModel(oEditModel, "editModel");

            this._oEditDialog.setBindingContext(oContext);
            this._oEditDialog.open();
        },

        onSaveEditDialog: function () {
            if (!this._validateEditDialog()) {
                MessageBox.error(this._i18n("validationError"));
                return;
            }

            var oDetailView = this._getDetailView();
            var oContext = oDetailView ? oDetailView.getBindingContext() : null;
            var oEditData = this._oEditDialog.getModel("editModel").getData();

            if (oContext) {
                // Sync changes back to OData context
                Object.keys(oEditData).forEach(function (sProp) {
                    if (oContext.getProperty(sProp) !== oEditData[sProp]) {
                        oContext.setProperty(sProp, oEditData[sProp]);
                    }
                });
            }

            this._oODataModel.submitBatch("productsGroup").then(() => {
                MessageToast.show(this._i18n("saveSuccess"));
                this._getBinding().refresh(); // Refresh master table
                if (this._oEditDialog) {
                    this._oEditDialog.close();
                }
            }).catch((oErr) => {
                MessageBox.error(this._i18n("saveError") + "\n" + (oErr.message || oErr));
            });
        },

        _validateEditDialog: function () {
            let bValid = true;
            const sViewId = this.getView().getId();

            const oNameInput = sap.ui.getCore().byId(sViewId + "--productEditName");
            if (oNameInput) {
                if (!oNameInput.getValue() || oNameInput.getValue().trim() === "") {
                    oNameInput.setValueState("Error");
                    oNameInput.setValueStateText(this._i18n("fieldRequired"));
                    bValid = false;
                } else {
                    oNameInput.setValueState("None");
                }
            }

            const oPriceInput = sap.ui.getCore().byId(sViewId + "--productEditPrice");
            if (oPriceInput) {
                const sPriceVal = oPriceInput.getValue();
                if (sPriceVal && sPriceVal.trim() !== "") {
                    const fPrice = parseFloat(sPriceVal);
                    if (isNaN(fPrice) || fPrice < 0) {
                        oPriceInput.setValueState("Error");
                        oPriceInput.setValueStateText(this._i18n("priceMustBePositive"));
                        bValid = false;
                    } else {
                        oPriceInput.setValueState("None");
                    }
                } else {
                    oPriceInput.setValueState("None");
                }
            }

            const oCurrencySelect = sap.ui.getCore().byId(sViewId + "--productEditCurrency");
            if (oCurrencySelect && !oCurrencySelect.getSelectedKey()) {
                oCurrencySelect.setValueState("Error");
                oCurrencySelect.setValueStateText(this._i18n("currencyRequired"));
                bValid = false;
            } else if (oCurrencySelect) {
                oCurrencySelect.setValueState("None");
            }

            const oStocksInput = sap.ui.getCore().byId(sViewId + "--productEditStocks");
            if (oStocksInput) {
                const iStocks = parseInt(oStocksInput.getValue());
                if (isNaN(iStocks) || iStocks < 0) {
                    oStocksInput.setValueState("Error");
                    oStocksInput.setValueStateText(this._i18n("stocksMustBePositive"));
                    bValid = false;
                } else {
                    oStocksInput.setValueState("None");
                }
            }

            const oSupplierSelect = sap.ui.getCore().byId(sViewId + "--productEditSupplier");
            if (oSupplierSelect && !oSupplierSelect.getSelectedKey()) {
                oSupplierSelect.setValueState("Error");
                oSupplierSelect.setValueStateText(this._i18n("supplierRequired"));
                bValid = false;
            } else if (oSupplierSelect) {
                oSupplierSelect.setValueState("None");
            }

            return bValid;
        },

        onCancelEditDialog: function () {
            var oDetailView = this._getDetailView();
            var oContext = oDetailView ? oDetailView.getBindingContext() : null;
            var oEditData = this._oEditDialog.getModel("editModel").getData();
            var bChanged = false;

            if (oContext) {
                var oOriginalData = oContext.getObject();
                bChanged = Object.keys(oEditData).some(function (sProp) {
                    // Simple comparison for basic types
                    return oOriginalData[sProp] != oEditData[sProp];
                });
            }

            if (bChanged) {
                MessageBox.confirm(this._i18n("cancelConfirm"), {
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.OK) {
                            if (this._oEditDialog) {
                                this._oEditDialog.close();
                            }
                        }
                    }
                });
            } else {
                if (this._oEditDialog) {
                    this._oEditDialog.close();
                }
            }
        },

        onCloseDetail: function () {
            console.log("[Products] onCloseDetail triggered!");
            const oFCL = this._getFCL();
            const oDetailView = this._getDetailView();

            if (oFCL) {
                oFCL.setLayout("OneColumn");
            }
            if (oDetailView) {
                oDetailView.unbindElement();
                oDetailView.setBindingContext(null);
            }
        },

        _getFCL: function () {
            let oControl = this.getView();
            while (oControl && oControl.getParent) {
                oControl = oControl.getParent();
                if (oControl && oControl.isA("sap.f.FlexibleColumnLayout")) {
                    return oControl;
                }
            }
            return null;
        },

        _getDetailView: function () {
            var oFCL = this._getFCL();
            if (oFCL) {
                var aMidPages = oFCL.getMidColumnPages();
                return aMidPages && aMidPages.length > 0 ? aMidPages[0] : null;
            }
            return null;
        },

        formatSupplierName: function (sID, aSuppliers, sOriginalName) {
            if (!sID) {
                return sOriginalName || "";
            }
            if (aSuppliers && aSuppliers.length > 0) {
                const oSupplier = aSuppliers.find(s => s.ID === sID);
                if (oSupplier) {
                    return oSupplier.name;
                }
            }
            return sOriginalName || "";
        },

        isRowReadonly: function (sID, aEditingRows) {
            try {
                if (!sID || !aEditingRows) return true;
                return aEditingRows.indexOf(sID) === -1;
            } catch (e) {
                return true;
            }
        },

        isRowEditable: function (sID, aEditingRows) {
            try {
                if (!sID || !aEditingRows) return false;
                return aEditingRows.indexOf(sID) !== -1;
            } catch (e) {
                return false;
            }
        },

        onFieldChange: function (oEvent) {
            const oInput = oEvent.getSource();
            if (oInput.getValue() === "") {
                oInput.setValueState("Error");
                oInput.setValueStateText(this._i18n("fieldRequired"));
            } else {
                oInput.setValueState("None");
            }
        },

        onSave: function () {
            if (!this._validateAll()) {
                MessageBox.error(this._i18n("validationError"));
                return;
            }

            this._oODataModel.submitBatch("productsGroup").then(() => {
                MessageToast.show(this._i18n("saveSuccess"));
                this._oUIModel.setProperty("/editingRows", []);
                this._onModelChange();
                this._oUIModel.refresh(true);
                this._getBinding().refresh();
            }).catch((oErr) => {
                MessageBox.error(this._i18n("saveError") + "\n" + (oErr.message || oErr));
            });
        },

        _validateAll: function () {
            let bValid = true;
            const oTable = this._getTable();
            const aEditingRows = this._oUIModel.getProperty("/editingRows") || [];

            oTable.getItems().forEach(oItem => {
                const oCtx = oItem.getBindingContext();
                if (!oCtx) return;
                const sID = oCtx.getProperty("ID");
                if (!aEditingRows.includes(sID)) return;

                const aCells = oItem.getCells();

                const oNameVBox = aCells[0];
                const oNameInput = oNameVBox && oNameVBox.getItems ? oNameVBox.getItems().find(c => c.isA("sap.m.Input")) : null;
                if (oNameInput) {
                    if (!oNameInput.getValue() || oNameInput.getValue().trim() === "") {
                        oNameInput.setValueState("Error");
                        oNameInput.setValueStateText(this._i18n("fieldRequired"));
                        bValid = false;
                    } else {
                        oNameInput.setValueState("None");
                    }
                }

                const oPriceVBox = aCells[2];
                const oPriceInput = oPriceVBox && oPriceVBox.getItems ? oPriceVBox.getItems().find(c => c.isA("sap.m.Input")) : null;
                if (oPriceInput) {
                    const sVal = oPriceInput.getValue();
                    if (sVal && sVal.trim() !== "") {
                        const fVal = parseFloat(sVal);
                        if (isNaN(fVal) || fVal < 0) {
                            oPriceInput.setValueState("Error");
                            oPriceInput.setValueStateText(this._i18n("priceMustBePositive"));
                            bValid = false;
                        } else {
                            oPriceInput.setValueState("None");
                        }
                    } else {
                        oPriceInput.setValueState("None");
                    }
                }

                const oCurrVBox = aCells[3];
                const oCurrSelect = oCurrVBox && oCurrVBox.getItems ? oCurrVBox.getItems().find(c => c.isA("sap.m.Select")) : null;
                if (oCurrSelect && !oCurrSelect.getSelectedKey()) {
                    oCurrSelect.setValueState("Error");
                    oCurrSelect.setValueStateText(this._i18n("currencyRequired"));
                    bValid = false;
                } else if (oCurrSelect) {
                    oCurrSelect.setValueState("None");
                }

                const oStocksVBox = aCells[4];
                const oStocksInput = oStocksVBox && oStocksVBox.getItems ? oStocksVBox.getItems().find(c => c.isA("sap.m.Input")) : null;
                if (oStocksInput) {
                    const iVal = parseInt(oStocksInput.getValue());
                    if (isNaN(iVal) || iVal < 0) {
                        oStocksInput.setValueState("Error");
                        oStocksInput.setValueStateText(this._i18n("stocksMustBePositive"));
                        bValid = false;
                    } else {
                        oStocksInput.setValueState("None");
                    }
                }

                const oSupplierVBox = aCells[5];
                const oSupplierSelect = oSupplierVBox && oSupplierVBox.getItems ? oSupplierVBox.getItems().find(c => c.isA("sap.m.Select")) : null;
                if (oSupplierSelect && !oSupplierSelect.getSelectedKey()) {
                    oSupplierSelect.setValueState("Error");
                    oSupplierSelect.setValueStateText(this._i18n("supplierRequired"));
                    bValid = false;
                } else if (oSupplierSelect) {
                    oSupplierSelect.setValueState("None");
                }
            });

            return bValid;
        },

        onCancel: function () {
            const bHasChanges = this._oODataModel.hasPendingChanges("productsGroup");
            if (!bHasChanges) {
                this._oUIModel.setProperty("/editingRows", []);
                this._onModelChange();
                this._oUIModel.refresh(true);
                this._getBinding().refresh();
                return;
            }

            MessageBox.confirm(this._i18n("cancelConfirm"), {
                onClose: (sAction) => {
                    if (sAction === MessageBox.Action.OK) {
                        this._oODataModel.resetChanges("productsGroup");
                        this._oUIModel.setProperty("/editingRows", []);
                        this._onModelChange();
                        // Redundant refresh removed to let OData V4 handle the removal smoothly
                        this._oUIModel.refresh(true);
                    }
                }
            });
        },

        onDeleteSelected: function () {
            const oTable = this._getTable();
            const aSelected = oTable.getSelectedItems();
            if (!aSelected.length) return;

            MessageBox.confirm(
                this._i18n("deleteConfirm").replace("{0}", aSelected.length), {
                onClose: (sAction) => {
                    if (sAction === MessageBox.Action.OK) {
                        aSelected.forEach(oItem => {
                            oItem.getBindingContext().delete("productsGroup");
                        });
                        this._oODataModel.submitBatch("productsGroup").then(() => {
                            MessageToast.show(this._i18n("deleteSuccess"));
                            this._oUIModel.setProperty("/hasSelection", false);
                            this._oUIModel.setProperty("/hasPendingChanges", false);
                            this._updateCount();
                        }).catch((oErr) => {
                            MessageBox.error(this._i18n("deleteError") + "\n" + (oErr.message || oErr));
                        });
                    }
                }
            }
            );
        },


        onOpenCsvDialog: function () {
            if (!this._oCsvDialog) {
                this._oCsvDialog = sap.ui.xmlfragment(
                    this.getView().getId(),
                    "com.abics.casestudy.view.fragment.CsvUploadDialog",
                    this
                );
                this.getView().addDependent(this._oCsvDialog);
            }
            this._oCsvDialog.open();
        },

        onCsvFileChange: function (oEvent) {
            const oFile = oEvent.getParameter("files")[0];
            if (!oFile) return;

            this._sCsvFileName = oFile.name;

            const oReader = new FileReader();
            oReader.onload = (e) => {
                this._sCsvContent = e.target.result;
                this.onValidateCsv();
            };
            oReader.readAsText(oFile);
        },

        onValidateCsv: function () {
            if (!this._sCsvContent) return;

            const oAction = this._oODataModel.bindContext("/validateProductsCsv(...)");
            oAction.setParameter("csvContent", this._sCsvContent);

            oAction.execute().then(() => {
                const oResult = oAction.getBoundContext().getObject();
                this._showCsvValidationResult(oResult, this._sCsvFileName);
            }).catch((oErr) => {
                MessageBox.error(this._i18n("csvValidationFailed", [oErr.message || oErr]));
            });
        },

        _showCsvValidationResult: function (oResult, sFileName) {
            const aErrors = oResult.errors || [];
            const bValid = oResult.valid === true;

            const lines = (this._sCsvContent || "").split(/\r?\n/).filter(l => l.trim() !== "");
            const iTotalRows = Math.max(0, lines.length - 1);
            const header = lines.length > 0 ? lines[0].split(",").map(h => h.trim().toLowerCase().replace(/^"|"$/g, "")) : [];
            const requiredCols = ["name", "currency_code", "supplier_id"];
            const bHasRequiredCols = requiredCols.every(c => header.includes(c));
            const bHasRows = iTotalRows > 0;
            const bDataValid = bHasRequiredCols && bHasRows && aErrors.length === 0;

            const aChecks = [
                { label: this._i18n("csvCheckFormat"),  passed: true,            detail: "" },
                { label: this._i18n("csvCheckColumns"), passed: bHasRequiredCols, detail: bHasRequiredCols ? "" : requiredCols.filter(c => !header.includes(c)).join(", ") },
                { label: this._i18n("csvCheckRows"),    passed: bHasRows,         detail: "" },
                { label: this._i18n("csvCheckData"),    passed: bDataValid,       detail: bDataValid ? "" : aErrors.slice(0, 3).map(e => e.message).join("; ") }
            ];

            const oResultModel = new JSONModel({
                fileName: sFileName || "",
                totalRows: iTotalRows,
                valid: bValid,
                checks: aChecks,
                errors: aErrors
            });

            const oResultsBox = sap.ui.getCore().byId(this.getView().getId() + "--productCsvValidationResults");
            if (oResultsBox) {
                oResultsBox.setModel(oResultModel, "csvResult");
                oResultsBox.setVisible(true);
            }

            const oErrorPanel = sap.ui.getCore().byId(this.getView().getId() + "--productCsvErrorPanel");
            if (oErrorPanel) {
                oErrorPanel.setVisible(aErrors.length > 0);
            }

            const oUploadBtn = sap.ui.getCore().byId(this.getView().getId() + "--productUploadCsvBtn");
            if (oUploadBtn) {
                oUploadBtn.setEnabled(bValid);
            }
        },

        onUploadCsv: function () {
            if (!this._sCsvContent) return;

            const oAction = this._oODataModel.bindContext("/uploadProductsCsv(...)");
            oAction.setParameter("csvContent", this._sCsvContent);

            oAction.execute().then(() => {
                MessageToast.show(this._i18n("csvUploadSuccess"));
                this._oCsvDialog.close();
                this._getBinding().refresh();
                this._sCsvContent = null;
            }).catch((oErr) => {
                MessageBox.error(this._i18n("csvUploadFailed", [oErr.message || oErr]));
            });
        },

        onCsvDialogClose: function () {
            this._oCsvDialog.close();
            this._sCsvContent = null;
        },


        _i18n: function (sKey, aArgs) {
            const sText = this.getOwnerComponent().getModel("i18n").getProperty(sKey);
            return aArgs ? formatMessage(sText, aArgs) : sText;
        }

    });
});