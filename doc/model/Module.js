var requirejs = (typeof requirejs === "undefined" ? require("requirejs") : requirejs);

requirejs(["rAppid"], function (rAppid) {
    rAppid.defineClass("doc.model.Module", ["js.data.Model"], function (Model) {
        return Model.inherit({
            defaults:{
                path: ""
            }
        });
    });
});