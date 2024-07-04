const BaseService = require("./BaseService");

class PrivateSocketService extends BaseService {
    static MODULES = {
        nacl: require('tweetnacl'),
        naclutil: require('tweetnacl-util'),
    }
}

module.exports = {
    PrivateSocketService,
};
