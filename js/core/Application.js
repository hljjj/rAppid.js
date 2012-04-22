define(
    ["js/core/UIComponent", "js/core/History"], function (UIComponent, History) {
        return UIComponent.inherit("js.core.Application", {
            ctor: function () {
                this.history = new History();

                this.callBase();
            },

            initialize: function () {
                // set up application wide vars
                this.callBase();
            },

            _inject: function () {
                // overwrite and call inside start
            },

            _initializeDescriptors: function () {
                this.callBase();
                UIComponent.prototype._inject.call(this);
            },

            /**
             * Method called, when application is initialized
             *
             * @param {Object} parameter
             * @param {Function} callback
             */
            start: function (parameter, callback) {
                parameter = parameter || {};

                this.history.start(callback, parameter.initialHash);
            },
            render: function (target) {
                var dom = this.callBase(null);

                if (target) {
                    target.appendChild(dom);
                }

                return dom;
            },
            toString: function () {
                return "js.core.Application";
            }
        });
    }
);