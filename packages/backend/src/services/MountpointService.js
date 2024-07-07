// const Mountpoint = o => ({ ...o });

const BaseService = require("./BaseService");

/**
 * This will eventually be a service which manages the storage
 * backends for mountpoints.
 * 
 * For the moment, this is a way to access the storage backend
 * in situations where ContextInitService isn't able to
 * initialize a context.
 */
class MountpointService extends BaseService {
    static default_mountpoints = [
        {
            mapping: '/',
            engine: 'puter',
        },
        {
            mapping: '/x/mnt/local',
            engine: 'local',
            parameters: {
                auto_mkdir: true,
                path: '{runtime}/local',
                uid_strategy: 'uuidv4',
            }
        }
    ]
    
    async _init () {
        // this.mountpoints_ = {};
        
        // Temporary solution - we'll develop this incrementally
        this.storage_ = null;
        this.mounts_ = {};
        
        const mountpoints = [
            ...this.constructor.default_mountpoints,
            ...(this.config.mountpoints ?? [])
        ];
        //
    }
    
    // Temporary solution - we'll develop this incrementally
    set_storage (storage) {
        this.storage_ = storage;
    }
    get_storage () {
        return this.storage_;
    }
}

module.exports = {
    MountpointService,
};
