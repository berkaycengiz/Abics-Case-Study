sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/model/Sorter",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/f/library"
], function (Controller, JSONModel, Filter, FilterOperator, Sorter, MessageBox, MessageToast, fioriLibrary) {
    "use strict";

    return Controller.extend("com.abics.casestudy.controller.Products", {
        onInit: function () {
            this._oUIModel = new JSONModel({
                layout: fioriLibrary.LayoutType.OneColumn,
                count: 0,
                hasSelection: false,
                hasPendingChanges: false,
                hasActiveFilters: false,
                editingRows: [], 
                allSelected: false,
                sortColumn: "createdAt",
                sortDescending: true
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
        },

        onExit: function () {
            this._oODataModel.detachPropertyChange(this._onModelChange, this);
        },

        _onModelChange: function () {
            const bHas = this._oODataModel.hasPendingChanges("productsGroup");
            const aEditingRows = this._oUIModel.getProperty("/editingRows") || [];
            if (aEditingRows.length === 0 && bHas) {
                // Ignore OData formatting changes if user hasn't explicitly entered edit mode
                this._oODataModel.resetChanges("productsGroup");
                this._oUIModel.setProperty("/hasPendingChanges", false);
            } else {
                this._oUIModel.setProperty("/hasPendingChanges", bHas || aEditingRows.length > 0);
            }
        },

        _loadSuppliers: function () {
            const oListBinding = this._oODataModel.bindList("/Suppliers", null, [], [], {
                $select: "ID,name"
            });
            oListBinding.requestContexts(0, 500).then((aContexts) => {
                const aSuppliers = aContexts.map(c => c.getObject());
                // Prepend empty supplier
                aSuppliers.unshift({ ID: "", name: this._i18n("noSupplier") });
                this._oUIModel.setProperty("/suppliers", aSuppliers);
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
            }).catch((oErr) => {
                console.error("Failed to load currencies", oErr);
            });
        },

        _getTable: function () {
            return this.byId("productsTable");
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

            let bDescending = false;
            if (this._oUIModel.getProperty("/sortColumn") === sColumn) {
                bDescending = !this._oUIModel.getProperty("/sortDescending");
            }

            this._oUIModel.setProperty("/sortColumn", sColumn);
            this._oUIModel.setProperty("/sortDescending", bDescending);

            this._aSorters = [new Sorter(sColumn, bDescending)];
            this._getBinding().sort(this._aSorters);
        },

        onDataReceived: function () {
            var oBinding = this._getBinding();
            if (oBinding) {
                var iCount = oBinding.getCount();
                this._oUIModel.setProperty("/count", iCount || 0);
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

        onFilterConfirm: function (oEvent) {
            const oFilterBar = sap.ui.getCore().byId(this.getView().getId() + "--filterBar");
            const aFilters = [];
            const aTokens = [];

            const oCurrSelect = sap.ui.getCore().byId(this.getView().getId() + "--currencyFilter");
            if (oCurrSelect && oCurrSelect.getSelectedKey()) {
                const sCurr = oCurrSelect.getSelectedKey();
                aFilters.push(new Filter("currency", FilterOperator.EQ, sCurr));
                aTokens.push({ key: "currency", text: `Currency: ${sCurr}` });
            }

            const oPriceFrom = sap.ui.getCore().byId(this.getView().getId() + "--priceFrom");
            const oPriceTo = sap.ui.getCore().byId(this.getView().getId() + "--priceTo");
            if (oPriceFrom && oPriceFrom.getValue()) {
                aFilters.push(new Filter("price", FilterOperator.GE, parseFloat(oPriceFrom.getValue())));
                aTokens.push({ key: "priceFrom", text: `Price ≥ ${oPriceFrom.getValue()}` });
            }
            if (oPriceTo && oPriceTo.getValue()) {
                aFilters.push(new Filter("price", FilterOperator.LE, parseFloat(oPriceTo.getValue())));
                aTokens.push({ key: "priceTo", text: `Price ≤ ${oPriceTo.getValue()}` });
            }

            const oStockMin = sap.ui.getCore().byId(this.getView().getId() + "--stockMin");
            if (oStockMin && oStockMin.getValue()) {
                aFilters.push(new Filter("stocks", FilterOperator.GE, parseInt(oStockMin.getValue())));
                aTokens.push({ key: "stocksMin", text: `Stock ≥ ${oStockMin.getValue()}` });
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
            const oTokensBox = this.byId("filterTokens");
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
            this._getBinding().filter(aAllFilters);
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
                this._oUIModel.refresh(true);
            }
        },

        onRowPress: function (oEvent) {
            const oContext = oEvent.getSource().getBindingContext();
            if (!oContext) return;

            const oDetailView = this.byId("detailView");
            if (oDetailView) {
                oDetailView.setBindingContext(oContext);
            }
            
            if (sap.f && sap.f.LayoutType) {
                this._oUIModel.setProperty("/layout", sap.f.LayoutType.TwoColumnsMidExpanded);
            } else {
                // Fiori library import referenced from onInit setup
                const fioriLibrary = sap.ui.require("sap/f/library");
                this._oUIModel.setProperty("/layout", fioriLibrary.LayoutType.TwoColumnsMidExpanded);
            }
        },

        onCloseDetail: function () {
            if (sap.f && sap.f.LayoutType) {
                this._oUIModel.setProperty("/layout", sap.f.LayoutType.OneColumn);
            } else {
                const fioriLibrary = sap.ui.require("sap/f/library");
                this._oUIModel.setProperty("/layout", fioriLibrary.LayoutType.OneColumn);
            }
            const oDetailView = this.byId("detailView");
            if (oDetailView) {
                oDetailView.setBindingContext(null);
            }
        },

        isRowReadonly: function(sID, aEditingRows) {
            try {
                if (!sID || !aEditingRows) return true;
                return aEditingRows.indexOf(sID) === -1;
            } catch (e) {
                return true;
            }
        },

        isRowEditable: function(sID, aEditingRows) {
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
                this._oUIModel.refresh(true);
                this._oUIModel.setProperty("/hasPendingChanges", false);
                this._getBinding().refresh();
            }).catch((oErr) => {
                MessageBox.error(this._i18n("saveError") + "\n" + (oErr.message || oErr));
            });
        },

        _validateAll: function () {
            let bValid = true;
            const oTable = this._getTable();
            oTable.getItems().forEach(oItem => {
                const oNameInput = oItem.getCells()[0];
                if (oNameInput && oNameInput.isA("sap.m.Input") && oNameInput.getValue() === "") {
                    oNameInput.setValueState("Error");
                    bValid = false;
                }
            });
            return bValid;
        },

        onCancel: function () {
            MessageBox.confirm(this._i18n("cancelConfirm"), {
                onClose: (sAction) => {
                    if (sAction === MessageBox.Action.OK) {
                        if (this._oODataModel.hasPendingChanges("productsGroup")) {
                            this._oODataModel.resetChanges("productsGroup");
                        }
                        this._oUIModel.setProperty("/editingRows", []);
                        this._oUIModel.refresh(true);
                        this._oUIModel.setProperty("/hasPendingChanges", false);
                        this._getBinding().refresh();
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
                            }).catch((oErr) => {
                                MessageBox.error(this._i18n("deleteError") + "\n" + (oErr.message || oErr));
                            });
                        }
                    }
                }
            );
        },

        onRowPress: function (oEvent) {
            const oContext = oEvent.getSource().getBindingContext()
                || oEvent.getSource().getParent().getBindingContext();
            if (!oContext) return;

            this._oUIModel.setProperty("/layout", LayoutType.TwoColumnsMidExpanded);

            const oDetailView = this.byId("detailView");
            if (oDetailView) {
                oDetailView.bindElement({
                    path: oContext.getPath(),
                    parameters: { $expand: "supplier" }
                });
            }
        },

        onCloseDetail: function () {
            this._oUIModel.setProperty("/layout", LayoutType.OneColumn);
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

            const oReader = new FileReader();
            oReader.onload = (e) => {
                this._sCsvContent = e.target.result;

                const oValidateBtn = sap.ui.getCore().byId(this.getView().getId() + "--validateCsvBtn");
                if (oValidateBtn) oValidateBtn.setEnabled(true);
            };
            oReader.readAsText(oFile);
        },

        onValidateCsv: function () {
            if (!this._sCsvContent) return;

            const oAction = this._oODataModel.bindContext("/validateProductsCsv(...)");
            oAction.setParameter("csvContent", this._sCsvContent);

            oAction.execute().then(() => {
                const oResult = oAction.getBoundContext().getObject();
                this._showCsvValidationResult(oResult);
            }).catch((oErr) => {
                MessageBox.error("CSV validation failed: " + (oErr.message || oErr));
            });
        },

        _showCsvValidationResult: function (oResult) {
            const oResultModel = new JSONModel(oResult);
            const oResultsBox = sap.ui.getCore().byId(this.getView().getId() + "--csvValidationResults");
            if (oResultsBox) {
                oResultsBox.setModel(oResultModel, "csvResult");
                oResultsBox.setVisible(true);
            }

            const oUploadBtn = sap.ui.getCore().byId(this.getView().getId() + "--uploadCsvBtn");
            if (oUploadBtn) {
                oUploadBtn.setEnabled(oResult.valid === true);
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
                MessageBox.error("CSV upload failed: " + (oErr.message || oErr));
            });
        },

        onCsvDialogClose: function () {
            this._oCsvDialog.close();
            this._sCsvContent = null;
        },

        checkPendingChanges: function () {
            return new Promise((resolve, reject) => {
                if (!this._oODataModel.hasPendingChanges("productsGroup")) {
                    resolve();
                    return;
                }
                MessageBox.confirm(this._i18n("unsavedChanges"), {
                    onClose: (sAction) => {
                        if (sAction === MessageBox.Action.OK) {
                            this._oODataModel.resetChanges("productsGroup");
                            resolve();
                        } else {
                            reject();
                        }
                    }
                });
            });
        },

        _i18n: function (sKey) {
            // async: true konfigürasyonunda getResourceBundle Promise döndüğü için senkron kullanımda
            // getProperty ile değer doğrudan modelden çekilir. (Argümanlar varsa manuel replace kullanılmalıdır)
            return this.getOwnerComponent().getModel("i18n").getProperty(sKey);
        }

    });
});