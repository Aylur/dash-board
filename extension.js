'use strict';

const { St, GObject, Clutter, Meta, Shell } = imports.gi;
const PanelMenu = imports.ui.panelMenu;
const Main = imports.ui.main;
const Me = imports.misc.extensionUtils.getCurrentExtension()
const Widget = Me.imports.widgets;

const DashBoard = GObject.registerClass(
class DashBoard extends PanelMenu.Button {
    _init () {
        super._init(0.0, 'Control Center', false);

        //icon
        this.add_child(new St.Icon({
            icon_name : 'org.gnome.Settings-applications-symbolic',
            style_class : 'system-status-icon',
        }));   

        this.opened = false;
        this.menu.connect('open-state-changed', () => this.updateAll() );
        this.menu.actor.connect('button-press-event', () => this.menu.close());

        //widgets
        this.welcome = new Widget.WelcomeBox();
        this.sliders = new Widget.SliderBox();
        this.clock = new Widget.ClockBox();
        this.media = new Widget.MediaBox();
        this.apps = new Widget.AppBox();
        this.links = new Widget.LinkBox();
        this.controls = new Widget.ControlsBox();
        this.dirs = new Widget.DirectoryBox();
        this.shellBox = new Widget.ShellBox();

        //UI
        let monitor = Main.layoutManager.primaryMonitor;
        this.menu.actor.width = monitor.width;
        this.menu.actor.height = monitor.height;
        this.menu.box.x_align = Clutter.ActorAlign.CENTER;
        this.menu.box.y_align = Clutter.ActorAlign.CENTER;
        this.menu.box.add_style_class_name('db-box');
        this.menu.actor.style = 'background-color:transparent; border:none; boxshadow:none';

        this.mainBox =          new St.BoxLayout({
            style_class: 'popup-menu db-main-box db-container',
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this.centerBox =        new St.BoxLayout({ vertical: true,  style_class: 'db-container', });
        this.centerTop =        new St.BoxLayout({ vertical: false, style_class: 'db-container', });
        this.centerTopLeft =    new St.BoxLayout({ vertical: true,  style_class: 'db-container', });
        this.centerTopRight =   new St.BoxLayout({ vertical: true,  style_class: 'db-container', });
        this.centerBox.add_child(this.centerTop);
        this.centerTop.add_child(this.centerTopLeft);
        this.centerTop.add_child(this.centerTopRight);
        this.leftBox =          new St.BoxLayout({ vertical: true, style_class: 'db-container', });
        this.rightBox =         new St.BoxLayout({ vertical: true, style_class: 'db-container', });
        this.mainBox.add_child(this.leftBox);
        this.mainBox.add_child(this.centerBox);
        this.mainBox.add_child(this.rightBox);

        this.leftBox.add_child(this.welcome);
        this.leftBox.add_child(this.sliders);

        this.centerTopLeft.add_child(this.media);
        this.centerTopLeft.add_child(this.shellBox);
        this.centerTopRight.add_child(this.clock);
        this.centerTopRight.add_child(this.apps);
        this.centerBox.add_child(this.links);

        this.rightBox.add_child(this.controls);
        this.rightBox.add_child(this.dirs);

        this.menu.box.add_child(this.mainBox);
    }
    updateAll(){
        this.sliders.updateAll();
        this.apps.updateAll();
    }
    toggle(){
        if(this.menu.isOpen)
            this.menu.close();
        else this.menu.open();
    }
});
    
function init(){
}

var dashBoard;

function enable(){
    dashBoard = new DashBoard();
    Main.panel.addToStatusArea('dashBoard', dashBoard, 1, 'left');
}

function disable(){
    Main.panel._leftBox.remove_child(dashBoard);
    dashBoard.destroy();
}