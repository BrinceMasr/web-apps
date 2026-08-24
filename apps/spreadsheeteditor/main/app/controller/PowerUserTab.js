/*
 * (c) Copyright Ascensio System SIA 2010-2024
 *
 * This program is a free software product. You can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License (AGPL)
 * version 3 as published by the Free Software Foundation. In accordance with
 * Section 7(a) of the GNU AGPL its Section 15 shall be amended to the effect
 * that Ascensio System SIA expressly excludes the warranty of non-infringement
 * of any third-party rights.
 *
 * This program is distributed WITHOUT ANY WARRANTY; without even the implied
 * warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR  PURPOSE. For
 * details, see the GNU AGPL at: http://www.gnu.org/licenses/agpl-3.0.html
 *
 * The  interactive user interfaces in modified source and object code versions
 * of the Program must display Appropriate Legal Notices, as required by
 * Section 5 of the GNU AGPL version 3.
 *
 * All the Product's GUI elements, including illustrations and icon sets, as
 * well as technical writing content are licensed under the
 * Creative Commons Attribution-ShareAlike 4.0 International. See the License
 * terms at http://creativecommons.org/licenses/by-sa/4.0/legalcode
 *
 */
/**
 * PowerUserTab.js
 *
 * Routes the Power User ribbon to existing Sheets commands and dialogs.
 */
define([
    'core',
    'common/main/lib/view/CustomizeQuickAccessDialog',
    'common/main/lib/view/ShortcutsDialog',
    'spreadsheeteditor/main/app/view/PowerUserTab'
], function () {
    'use strict';

    SSE.Controllers.PowerUserTab = Backbone.Controller.extend(_.extend({
        views: [
            'PowerUserTab'
        ],

        setApi: function (api) {
            if (api) {
                this.api = api;
                this.api.asc_registerCallback('asc_onSelectionChanged', _.bind(this.onSelectionChanged, this));
            }
            return this;
        },

        setConfig: function (config) {
            this.mode = config.mode;
            this.hasObjectSelection = false;
            this.view = this.createView('PowerUserTab');
            this.view.setObjectActionAvailability(0);
            return this;
        },

        createToolbarPanel: function () {
            return this.view.getPanel();
        },

        getView: function (name) {
            return !name && this.view ?
                this.view : Backbone.Controller.prototype.getView.call(this, name);
        },

        onSelectionChanged: function (info) {
            this.updateObjectActionAvailability(info);
        },


        onShortcuts: function () {
            if (this.shortcutsDialog && this.shortcutsDialog.isVisible()) {
                return;
            }
            this.shortcutsDialog = new Common.Views.ShortcutsDialog({
                api: this.api
            });
            this.shortcutsDialog.show();
        },

        onQuickAccess: function () {
            if (this.quickAccessDialog && this.quickAccessDialog.isVisible()) {
                return;
            }
            this.quickAccessDialog = new Common.Views.CustomizeQuickAccessDialog({
                showSave: this.mode.showSaveButton && Common.UI.LayoutManager.isElementVisible('header-save'),
                showPrint: this.mode.canPrint && this.mode.twoLevelHeader,
                showQuickPrint: this.mode.canQuickPrint && this.mode.twoLevelHeader,
                showObjectSizeActions: true,
                mode: this.mode,
                props: {
                    save: Common.localStorage.getBool('sse-quick-access-save', true),
                    print: Common.localStorage.getBool('sse-quick-access-print', true),
                    quickPrint: Common.localStorage.getBool('sse-quick-access-quick-print', true),
                    undo: Common.localStorage.getBool('sse-quick-access-undo', true),
                    redo: Common.localStorage.getBool('sse-quick-access-redo', true),
                    sameSize: Common.localStorage.getBool('sse-quick-access-same-size', true),
                    sameWidth: Common.localStorage.getBool('sse-quick-access-same-width', true),
                    sameHeight: Common.localStorage.getBool('sse-quick-access-same-height', true)
                }
            });
            this.quickAccessDialog.show();
        },

        onObjectSize: function (sizeType) {
            if (!this.hasObjectSelection) {
                return;
            }
            var objectCount = this.api && this.api.asc_getSelectedDrawingObjectsCount ?
                this.api.asc_getSelectedDrawingObjectsCount() : 0;
            if (typeof objectCount !== 'number' || objectCount < 2) {
                return;
            }
            this.api.asc_setSelectedDrawingObjectSize(sizeType);
            Common.NotificationCenter.trigger('edit:complete', this.view);
        },

        updateObjectActionAvailability: function (info) {
            if (!this.view) {
                return;
            }
            var selectionType = info && info.asc_getSelectionType ? info.asc_getSelectionType() : null;
            this.hasObjectSelection = selectionType === Asc.c_oAscSelectionType.RangeImage ||
                selectionType === Asc.c_oAscSelectionType.RangeChart ||
                selectionType === Asc.c_oAscSelectionType.RangeChartText ||
                selectionType === Asc.c_oAscSelectionType.RangeShape ||
                selectionType === Asc.c_oAscSelectionType.RangeShapeText;
            if (!this.hasObjectSelection || !this.api || !this.api.asc_getSelectedDrawingObjectsCount) {
                this.view.setObjectActionAvailability(0);
                return;
            }
            var objectCount = this.api.asc_getSelectedDrawingObjectsCount();
            this.view.setObjectActionAvailability(typeof objectCount === 'number' ? objectCount : 0);
        }
    }, SSE.Controllers.PowerUserTab || {}));
});
