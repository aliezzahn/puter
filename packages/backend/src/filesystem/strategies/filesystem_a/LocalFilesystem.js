const { AdvancedBase } = require("@heyputer/puter-js-common");

class LocalFilesystem extends AdvancedBase {
    async _init () {
        this.root_ = this.config.path;
    }
}
