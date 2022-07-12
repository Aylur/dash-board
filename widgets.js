'use strict';

const { St, GLib, Shell, Gio, Clutter, GObject, GnomeDesktop } = imports.gi;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const PanelMenu = imports.ui.panelMenu;
const Main = imports.ui.main;
const Slider = imports.ui.slider;
const Volume = imports.ui.status.volume;
const Brightness = imports.ui.status.brightness;
const Power = imports.ui.status.power;
const Util = imports.misc.util;
const SystemActions = imports.misc.systemActions;
const Favorites = imports.ui.appFavorites.getAppFavorites();
const MediaPlayer = Me.imports.mediaPlayer;

const Extension = Me.imports.extension;

var Button = GObject.registerClass(
class Button extends St.Button{
    _init(params){
        super._init(params);
        this.can_focus = true;
        this.connect('clicked',
            () => Extension.dashBoard.menu.close() );
    }
});

var WelcomeBox = GObject.registerClass(
class WelcomeBox extends St.BoxLayout{
    _init(){
        super._init({
            style_class: 'popup-menu-content db-widget db-container db-welcomeBox',
            vertical: true,
        });

        //user
        this.userImage = new St.Button({
            style_class: 'db-user-image',
            x_align: Clutter.ActorAlign.CENTER,
            style: 'background-image: url("'+ Me.dir.get_path() + '/media/userImage.png"); background-size: cover;',
        });
        this.userName = new St.Label({
            style: 'text-align: center',
            text: GLib.get_user_name(),
        });
        this.userBox = new St.BoxLayout({
            style_class: 'db-user-box',
            x_align: Clutter.ActorAlign.CENTER,
            vertical: true,
        });
        this.userBox.add_child(this.userImage);
        this.userBox.add_child(this.userName);

        //greet
        this.greetButton = new Button({
            style_class: 'db-btn',
            style: 'text-align: center',
        });
        this.greetButton_binding = this.greetButton.connect('clicked', () => 
            Shell.AppSystem.get_default().lookup_app('org.gnome.Calendar.desktop').activate() );

        this.add_child(this.userBox);
        this.add_child(this.greetButton);

        this.wallclock = new GnomeDesktop.WallClock();
        this.binding = this.wallclock.connect(
            'notify::clock',
            () => this.updateAll() );

        this.updateAll();
    }
    updateAll(){
        const d = new Date();
        let h = d.getHours();
        let greet = "Good Evening!";
        if(h > 6){ greet = "Good Morning!"; }
        if(h > 12){greet = "Good Afternoon!";}
        if(h > 18){greet = "Good Evening!";}
        this.greetButton.label = greet+'\n'+GLib.DateTime.new_now_local().format('%b %d. %A');
    }
    destroy(){
        this.greetButton.disconnect(this.greetButton_binding);
        this.wallclock.disconnect(this.binding);
        super.destroy();
    }
});

var VolumeSlider = GObject.registerClass(
    class VolumeSlider extends St.BoxLayout{
    _init(){
        super._init({
            style_class: 'db-volume-slider db-slider',
            y_expand: true,
        });

        this.slider = new Slider.Slider(0);
        this.icon = new Volume.Indicator();
        this.add_child(this.icon);
        this.add_child(this.slider);

        this.volCtl = Volume.getMixerControl(); 
        this.sink = this.volCtl.get_default_sink();
        this.maxVol = this.volCtl.get_vol_max_norm();

        this.sink_binding = null;

        this.sink_changed = this.volCtl.connect(
            'default-sink-changed',
            (controller, id) => this._sinkChange(controller, id) );

        this.slider.connect(
            'notify::value',
            () => this._setVolume() );
    }
    updateSlider(){
        this.slider.value = this.sink.volume / this.maxVol;
        if(!this.sink_binding){
            this.sink_binding = this.sink.connect(
                'notify::volume',
                () => this.updateSlider() );
        }
    }
    _setVolume()
    {
        let maxVol = this.volCtl.get_vol_max_norm();
        this.sink.volume = this.slider.value * maxVol;
        this.sink.push_volume();
    }
    _sinkChange(controller, id)
    {
        this.sink = controller.lookup_stream_id(id);
        this.updateSlider();
    }
    destroy(){
        if(this.sink_binding)
            this.volCtl.disconnect(this.sink_binding);
        super.destroy();
    }
});

var BrightnessSlider = GObject.registerClass(
class BrightnessSlider extends St.BoxLayout{
    _init(){
        super._init({
            style_class: 'db-brightness-slider db-slider',
            y_expand: true,
        });

        this.slider = new Slider.Slider(0);
        this.icon = new St.Icon({ icon_name: 'display-brightness-symbolic', });
        this.add_child(this.icon);
        this.add_child(this.slider);

        this.slider_binding = this.slider.connect(
            'notify::value',
            () => this._setBrightness() );

        this.brightness = new Brightness.Indicator();
        this.brightness_binding = this.brightness._slider.connect(
            'notify::value',
            () => this.updateSlider());
    }
    updateSlider(){
        this.slider.value = this.brightness._slider.value;
    }
    _setBrightness(){
        this.brightness._proxy.Brightness = this.slider.value * 100.0;
    }
    destroy(){
        this.slider.disconnect(this.slider_binding);
        this.brightness._slider.disconnect(this.brightness_binding);
        super.destroy();
    }
});

var PowerSlider = GObject.registerClass(
class PowerSlider extends St.BoxLayout{
    _init(){
        super._init({
            style_class: 'db-power-slider db-slider',
            y_expand: true,
        });

        this.slider = new Slider.Slider(0);
        this.slider.reactive = false;
        this.power = new Power.Indicator();
        this.add_child(this.power);
        this.add_child(this.slider);

        this.track_hover = true;
        this.reactive = true;

        this.power_binding = this.power._proxy.connect(
            'notify::Percentage',
            () => this.updateSlider() );

        this.slider_binding = this.slider.connect(
            'notify::value',
            () => this.setColorClass(this.slider.value) );
        
        this.updateSlider();
    }
    updateSlider(){
        this.slider.value = this.power._proxy.Percentage/100.0;
    }
    destroy(){
        this.power._proxy.disconnect(this.power_binding);
        super.destroy();
    }
    setColorClass(sliderValue){
        let value = sliderValue*100;
        this.remove_style_pseudo_class('red');
        this.remove_style_pseudo_class('orange');
        this.remove_style_pseudo_class('yellow');
        if(value < 75 && value >= 50) this.add_style_pseudo_class('yellow');
        else if(value < 50 && value >= 25) this.add_style_pseudo_class('orange');
        else if(value < 25) this.add_style_pseudo_class('red');
    }
});

var SliderBox = GObject.registerClass(
class SliderBox extends St.BoxLayout{
    _init(){
        super._init({
            style_class: 'popup-menu-content db-widget db-slider-box',
            y_expand: true,
            vertical: true,
        });

        this.volumeSlider = new VolumeSlider();
        this.brightnessSlider = new BrightnessSlider();
        this.powerSlider = new PowerSlider();
        this.add_child(this.volumeSlider);
        this.add_child(this.brightnessSlider);
        this.add_child(this.powerSlider);
    }
    updateAll(){
        this.volumeSlider.updateSlider();
        this.powerSlider.updateSlider();
        this.brightnessSlider.updateSlider();
    }
});

var ControlsBox = GObject.registerClass(
class ControlsBox extends St.BoxLayout{
    _init(){
        super._init({
            style_class: 'db-container db-controls-box',
            vertical: true,
        });

        this.settings = new Button({ style_class: 'db-btn popup-menu-content db-widget', label: '漣',  x_expand: true, });
        this.logOut = new Button({ style_class: 'db-btn popup-menu-content db-widget', label: '﫼',    x_expand: true, });
        this.wifi = new Button({ style_class: 'db-btn popup-menu-content db-widget', label: '直',      x_expand: true, });
        this.shutdown = new Button({ style_class: 'db-btn popup-menu-content db-widget', label: '',  x_expand: true, });

        this.settings.set_child(new St.Icon({ icon_name: 'org.gnome.Settings-symbolic', style_class: 'db-controls'}));
        this.logOut.set_child(new St.Icon({ icon_name: 'system-log-out-symbolic',       style_class: 'db-controls'}));
        this.wifi.set_child(new St.Icon({ icon_name: 'network-wireless-symbolic',       style_class: 'db-controls'}));
        this.shutdown.set_child(new St.Icon({ icon_name: 'system-shutdown-symbolic',    style_class: 'db-controls'}));

        this.bindings = [
            this.settings.connect('clicked', () => Shell.AppSystem.get_default().lookup_app('org.gnome.Settings.desktop').activate() ),
            // this.wifi.connect('clicked', () => {  Shell.AppSystem.get_default().lookup_app('gnome-wifi-panel.desktop').activate(); }),
            this.wifi.connect('clicked', () => this.showWifiDialog() ),
            this.shutdown.connect('clicked', () => SystemActions.getDefault().activateAction('power-off') ),
            this.logOut.connect('clicked', () => SystemActions.getDefault().activateAction('logout') ),
        ];

        this.row1 = new St.BoxLayout({ style_class: 'db-container', });
        this.row2 = new St.BoxLayout({ style_class: 'db-container', });

        this.row1.add_child(this.settings);
        this.row1.add_child(this.logOut);
        this.row2.add_child(this.wifi);
        this.row2.add_child(this.shutdown);
        
        this.add_child(this.row1);
        this.add_child(this.row2);
    }
    showWifiDialog(){
        const Main = imports.ui.main;
        const stockNM = Main.panel.statusArea.aggregateMenu._network;
        const Network = imports.ui.status.network;
        const NM = imports.gi.NM;

        let devices = stockNM._client.get_devices();
        let wifiDevice;
        devices.forEach(element => {
            if(element.device_type === NM.DeviceType.WIFI)
                wifiDevice = element;
        });
        let wrapper = new Network.NMDeviceWireless(stockNM._client, wifiDevice);
        wrapper._showDialog();
    }
});

let DirBtn = GObject.registerClass(
class DirBtn extends St.Button{
    _init(labelText, iconName, dirToOpen){
        super._init({
            style_class: 'db-btn db-dir-btn',
            can_focus: true,
        });

        this.connect('clicked', () => Util.spawn(["xdg-open", "/home/"+ GLib.get_user_name() + dirToOpen]));

        this.btnIcon = new St.Icon({
            icon_name: iconName,
            style_class: 'db-dir-icon',
        });
        this.btnLabel = new St.Label({
            text: labelText,
            y_align: Clutter.ActorAlign.CENTER,
        });
        
        this.box = new St.BoxLayout({});
        this.box.add_child(this.btnIcon);
        this.box.add_child(this.btnLabel);

        this.set_child(this.box);
        
        this.connect('clicked',
            () => Extension.dashBoard.menu.close());
    }
});

var DirectoryBox = GObject.registerClass(
class DirectoryBox extends St.BoxLayout{
    _init(){
        super._init({
            style_class: 'popup-menu-content db-widget db-container db-dir-box',
            y_expand: true,
            vertical: true,
        });

        this.buttons = [
            new DirBtn('Home', 'user-home-symbolic', '/'),
            new DirBtn('Documents', 'emblem-documents-symbolic', '/Documents/'),
            new DirBtn('Projects', 'application-x-executable-symbolic', '/Projects/'),
            new DirBtn('Music', 'folder-music-symbolic', '/Music/'),
            new DirBtn('Downloads', 'folder-download-symbolic', '/Downloads/'),
            new DirBtn('School', 'school-symbolic', '/Documents/hazfos/'),
        ];
        this.buttonsContainer = new St.BoxLayout({
            vertical: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'db-container',
        });
        this.buttons.forEach(element => {
            this.buttonsContainer.add_child(element);
        });
        this.add_child(this.buttonsContainer);
    }
});

var MediaBox = GObject.registerClass(
class MediaBox extends St.Bin{
    _init(){
        super._init({
            style_class: 'popup-menu-content db-widget db-media-box',
            y_expand: true,
        });
        this.media = new MediaPlayer.Media();
        this.media.connect('updated',
            () => this.updateAll() );
        
        this.updateAll();
    }
    updateAll(){
        let favPlayer = this.media.getFavPlayer();
        if(favPlayer)
            this.set_child(favPlayer);
        else
            this.set_child(new St.Label({
                text: 'Nothing playing',
                y_align: Clutter.ActorAlign.CENTER,
                x_align: Clutter.ActorAlign.CENTER,
            }));
    }
});

var ClockBox = GObject.registerClass(
class ClockBox extends St.BoxLayout{
    _init(){
        super._init({
            style_class: 'popup-menu-content db-widget db-clockBox db-container',
        });
        this.clock = new Button({
            style_class: 'db-clock-btn db-btn',
            x_expand: true, 
            y_expand: true, 
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.date = new St.Label({
            style_class: 'db-date',
            x_expand: true,
            y_expand: true, 
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.END,
        });
        this.day = new St.Label({
            style_class: 'db-day',
            x_expand: true,
            y_expand: true, 
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.START,
        });

        this.rightBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            x_align: Clutter.ActorAlign.START,
        });
        this.rightBox.add_child(this.date);
        this.rightBox.add_child(this.day);
        this.add_child(this.clock);
        this.add_child(this.rightBox);

        this.wallclock = new GnomeDesktop.WallClock();
        this.binding = this.wallclock.connect(
            'notify::clock',
            () => this.updateClock() );
        
        this.clock.connect('clicked',
            () => Shell.AppSystem.get_default().lookup_app('org.gnome.clocks.desktop').activate() );
    
        this.updateClock();
    }
    updateClock(){
        this.clock.label = GLib.DateTime.new_now_local().format(' %H:%M ');
        this.date.text = GLib.DateTime.new_now_local().format('%b, %d.');
        this.day.set_text(GLib.DateTime.new_now_local().format('%A'));
    }
    destroy(){
        this.wallclock.disconnect(this.binding);
        super.destroy();
    }
});

var AppBox = GObject.registerClass(
class AppBox extends St.BoxLayout{
    _init(){
        super._init({
            style_class: 'popup-menu-content db-widget db-app-box db-container',
            vertical: true,
            y_expand: true,
            x_expand: true,
        });

        this.apps = [];
        this.rows = [
            new St.BoxLayout({ style_class: 'db-container', x_expand: true, y_expand: true, }),
            new St.BoxLayout({ style_class: 'db-container', x_expand: true, y_expand: true, }),
            new St.BoxLayout({ style_class: 'db-container', x_expand: true, y_expand: true, }),
        ];

        this.binding = Favorites.connect(
            'changed',
            () => this.updateAll() );
    }
    updateAll(){
        this.apps.forEach(app => {
            app.destroy();
        });
        this.apps = [];

        this.rows.forEach(row => {
            row.remove_all_children();
        });

        let size = this.getFavs().length;
        for(let i=0; i<size; i++){
            let btn = new St.Button({
                can_focus: true,
                style_class: 'db-app-btn db-btn',
                x_expand: true,
                child: new St.Icon({
                    fallback_icon_name: 'application-x-executable',
                    gicon: Gio.Icon.new_for_string(this.getFavs()[i].icon.to_string()),
                }),
            });
            btn.connect('clicked', () => {
                this.getFavs()[i].activate();
                Extension.dashBoard.menu.close();
            });
            this.apps.push(btn);

            if(i <= 2) this.rows[0].add_child(btn);
            else if(i <= 5) this.rows[1].add_child(btn);
            else if(i <= 8) this.rows[2].add_child(btn);
        }

        if(size >= 2) this.add_child(this.rows[0]);
        if(size >= 5) this.add_child(this.rows[1]);
        if(size >= 8) this.add_child(this.rows[2]);
    }
    getFavs(){
        let favs = Favorites.getFavorites(); //Shell.App array
        return favs;
    }
    destroy(){
        Favorites.disconnect(this.binding);
        super.destroy();
    }
});
    
let LinkBtn = GObject.registerClass(
class LinkBtn extends St.Button{
    _init(url, icon){
        super._init({
            style_class: 'popup-menu-content db-widget db-btn '+'db-'+icon,
            can_focus: true,
            x_expand: true,
            y_expand: true, 
        });
        this.set_child(new St.Icon({
            gicon: Gio.Icon.new_for_string(Me.dir.get_path()+'/media/icons/'+icon+'-symbolic.svg'),
            style_class: 'db-link-btn',
        }));
        this.connect(
            'clicked',
            () => Util.spawn(["xdg-open",url]) );
            
        this.connect('clicked',
            () => Extension.dashBoard.menu.close());
    }
});
    
var LinkBox = GObject.registerClass(
class LinkBox extends St.BoxLayout{
    _init(){
        super._init({
            style_class: 'db-container db-link-box',
            x_expand: true,
            y_expand: true, 
        })

        this.buttons = [
            new LinkBtn('https://reddit.com/', 'reddit'),
            new LinkBtn('https://youtube.com/','youtube'),
            new LinkBtn('https://github.com/','github'),
            new LinkBtn('https://gmail.com/','gmail'),
            new LinkBtn('https://canvas.elte.hu/belepes/','canvas'),
            new LinkBtn('https://ncore.pro/login.php','ncore'),
            // new LinkBtn('https://www.1337x.to/','1337x'),
        ];

        this.buttons.forEach(element => {
            this.add_child(element);
        });
    }
});

var ShellBox = GObject.registerClass(
class ShellBox extends St.BoxLayout{
    _init(){
        super._init({
            style_class: 'db-container db-shell-box',
            x_expand: true,
        })

        this.searchBtn = new Button({
            x_expand: true,
            style_class: 'popup-menu-content db-widget db-btn',
            child: new St.Icon({
                icon_name: 'system-search-symbolic',
            }),
        });
        this.searchBtn.connect('clicked',
            () => Main.overview.focusSearch() );

        this.showAppsBtn = new Button({
            x_expand: true,
            style_class: 'popup-menu-content db-widget db-btn',
            child: new St.Icon({
                icon_name: 'view-app-grid-symbolic',
            })
        });
        this.showAppsBtn.connect('clicked',
            () => Main.overview.showApps() );

        this.incognitoBtn = new Button({
            x_expand: true,
            style_class: 'popup-menu-content db-widget db-btn',
            child: new St.Icon({
                icon_name: 'view-private-symbolic',
            }),
        });
        this.incognitoBtn.connect('clicked',
            () => Util.spawn(["flatpak", "run", "org.mozilla.Firefox", "--private-window"]));

        this.add_child(this.incognitoBtn);
        this.add_child(this.searchBtn);
        this.add_child(this.showAppsBtn);
    }
});