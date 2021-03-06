define(["js/core/Bindable", "js/core/List", "flow", "srv/auth/AuthorizationRequest"], function (Bindable, List, flow, AuthorizationRequest) {

    return Bindable.inherit('srv.core.User', {

        defaults: {
            authentications: List
        },

        ctor: function (context, server) {
            this.$context = context;
            this.$server = server;

            this.callBase();
        },

        addAuthentication: function (authentication) {
            this.$.authentications.add(authentication);
        },

        getAuthenticationByProviderName: function (providerName) {
            return this.$.authentications.find(function (auth) {
                return auth.$.provider === providerName;
            });
        },

        isAnonymous: function () {
            return this.$.authentications.isEmpty();
        },

        loadAuthentications: function (callback) {

            var self = this;
            this._initAuthentications(function (err) {
                callback(err, self.authentications);
            });

        },

        _initAuthentications: function (callback) {

            flow()
                .parEach(this.$.authentications.$items, function (authentication, cb) {
                    authentication.init(cb)
                })
                .exec(callback)
        },

        isAuthorized: function (authorizationRequest, callback) {
            var self = this;

            if (!(authorizationRequest instanceof AuthorizationRequest)) {
                authorizationRequest = new AuthorizationRequest(authorizationRequest);
            }

            this._initAuthentications(function (err) {
                if (!err) {
                    self.$server.$authorisationService.isAuthorized(self.$context, authorizationRequest, callback);
                } else {
                    callback(err);
                }
            });

        },

        isAuthenticated: function () {
            return !this.$.authentications.isEmpty();
        }

    });

});