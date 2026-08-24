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
 * Spreadsheet productivity commands that reuse the existing editor APIs.
 */
define([
    'common/main/lib/component/BaseView',
    'common/main/lib/component/Button'
], function () {
    'use strict';

    SSE.Views.PowerUserTab = Common.UI.BaseView.extend(_.extend((function () {
        var template = '<section class="panel" data-tab="power-user" role="tabpanel" aria-labelledby="power-user">' +
            '<div class="group">' +
                '<span class="btn-slot text x-huge" id="slot-power-user-shortcuts"></span>' +
                '<span class="btn-slot text x-huge" id="slot-power-user-quick-access"></span>' +
            '</div>' +
            '<div class="separator long"></div>' +
            '<div class="group">' +
                '<span class="btn-slot text x-huge" id="slot-power-user-same-size"></span>' +
                '<span class="btn-slot text x-huge" id="slot-power-user-same-width"></span>' +
                '<span class="btn-slot text x-huge" id="slot-power-user-same-height"></span>' +
            '</div>' +
        '</section>';

        function executeControllerAction(action, value) {
            var controller = SSE.getController('PowerUserTab');
            controller && controller[action](value);
        }




        return {
            initialize: function () {
                Common.UI.BaseView.prototype.initialize.call(this);

                var _set = Common.enumLock,
                    objectSelectionLock = 'power-user-object-selection';
                this.objectSelectionLock = objectSelectionLock;
                this.lockedControls = [];

                this.btnShortcuts = new Common.UI.Button({
                    id: 'id-power-user-btn-shortcuts',
                    cls: 'btn-toolbar x-huge icon-top',
                    iconCls: 'toolbar__icon btn-settings',
                    caption: this.textShortcuts,
                    lock: [_set.disableOnStart, _set.lostConnect],
                    dataHint: '1',
                    dataHintDirection: 'bottom',
                    dataHintOffset: 'small',
                    dataHintTitle: 'K'
                });
                this.btnQuickAccess = new Common.UI.Button({
                    id: 'id-power-user-btn-quick-access',
                    cls: 'btn-toolbar x-huge icon-top',
                    iconCls: 'toolbar__icon btn-settings',
                    caption: this.textQuickAccess,
                    lock: [_set.disableOnStart, _set.lostConnect],
                    dataHint: '1',
                    dataHintDirection: 'bottom',
                    dataHintOffset: 'small',
                    dataHintTitle: 'Q'
                });
                this.btnSameSize = new Common.UI.Button({
                    id: 'id-power-user-btn-same-size',
                    cls: 'btn-toolbar x-huge icon-top',
                    iconCls: 'toolbar__icon btn-img-align',
                    caption: this.textSameSize,
                    disabled: true,
                    lock: [_set.editCell, _set.lostConnect, _set.coAuth, objectSelectionLock],
                    dataHint: '1',
                    dataHintDirection: 'bottom',
                    dataHintOffset: 'small',
                    dataHintTitle: 'S'
                });
                this.btnSameWidth = new Common.UI.Button({
                    id: 'id-power-user-btn-same-width',
                    cls: 'btn-toolbar x-huge icon-top',
                    iconCls: 'toolbar__icon btn-img-align',
                    caption: this.textSameWidth,
                    disabled: true,
                    lock: [_set.editCell, _set.lostConnect, _set.coAuth, objectSelectionLock],
                    dataHint: '1',
                    dataHintDirection: 'bottom',
                    dataHintOffset: 'small',
                    dataHintTitle: 'W'
                });
                this.btnSameHeight = new Common.UI.Button({
                    id: 'id-power-user-btn-same-height',
                    cls: 'btn-toolbar x-huge icon-top',
                    iconCls: 'toolbar__icon btn-img-align',
                    caption: this.textSameHeight,
                    disabled: true,
                    lock: [_set.editCell, _set.lostConnect, _set.coAuth, objectSelectionLock],
                    dataHint: '1',
                    dataHintDirection: 'bottom',
                    dataHintOffset: 'small',
                    dataHintTitle: 'H'
                });

                this.objectActionButtons = [this.btnSameSize, this.btnSameWidth, this.btnSameHeight];
                this.lockedControls = [
                    this.btnShortcuts,
                    this.btnQuickAccess,
                    this.btnSameSize,
                    this.btnSameWidth,
                    this.btnSameHeight
                ];
                Common.UI.LayoutManager.addControls(this.lockedControls);

            },

            getPanel: function () {
                this.$el = $(template);
                this.btnShortcuts.render(this.$el.find('#slot-power-user-shortcuts'));
                this.btnQuickAccess.render(this.$el.find('#slot-power-user-quick-access'));
                this.btnSameSize.render(this.$el.find('#slot-power-user-same-size'));
                this.btnSameWidth.render(this.$el.find('#slot-power-user-same-width'));
                this.btnSameHeight.render(this.$el.find('#slot-power-user-same-height'));
                this.$el.on('click', '#id-power-user-btn-shortcuts', function () {
                    executeControllerAction('onShortcuts');
                });
                this.$el.on('click', '#id-power-user-btn-quick-access', function () {
                    executeControllerAction('onQuickAccess');
                });
                this.$el.on('click', '#id-power-user-btn-same-size', function () {
                    executeControllerAction('onObjectSize', 0);
                });
                this.$el.on('click', '#id-power-user-btn-same-width', function () {
                    executeControllerAction('onObjectSize', 1);
                });
                this.$el.on('click', '#id-power-user-btn-same-height', function () {
                    executeControllerAction('onObjectSize', 2);
                });
                return this.$el;
            },

            getButtons: function () {
                return this.lockedControls;
            },

            setObjectActionAvailability: function (objectCount) {
                Common.Utils.lockControls(
                    this.objectSelectionLock,
                    objectCount < 2,
                    {array: this.objectActionButtons}
                );
            },

            textQuickAccess: 'Customize Quick Access',
            textSameHeight: 'Same Height',
            textSameSize: 'Same Size',
            textSameWidth: 'Same Width',
            textShortcuts: 'Keyboard Shortcuts'
        };
    }()), SSE.Views.PowerUserTab || {}));
});
