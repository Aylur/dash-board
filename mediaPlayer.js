'use strict';

const { GObject, St, Gio, Clutter, Shell } = imports.gi;
const Slider = imports.ui.slider;

const PlayerIFace =
`<node>
    <interface name='org.mpris.MediaPlayer2.Player'>
        <method name='PlayPause' />
        <method name='Next' />
        <method name='Previous' />
        <method name='Stop' />
        <method name='Play' />
        <property name='CanControl' type='b' access='read' />
        <property name='CanGoNext' type='b' access='read' />
        <property name='CanGoPrevious' type='b' access='read' />
        <property name='CanPlay' type='b' access='read' />
        <property name='CanPause' type='b' access='read' />
        <property name='Metadata' type='a{sv}' access='read' />
        <property name='PlaybackStatus' type='s' access='read' />
        <property name='Shuffle' type='b' access='readwrite' />
        <property name='LoopStatus' type='s' access='readwrite' />
        <property name='Volume' type='d' access='readwrite' />
    </interface>
</node>`;

const MprisIFace =
`<node>
    <interface name='org.mpris.MediaPlayer2'>
        <method name='Raise' />
        <method name='Quit' />
        <property name='CanQuit' type='b' access='read' />
        <property name='CanRaise' type='b' access='read' />
        <property name='Identity' type='s' access='read' />
        <property name='DesktopEntry' type='s' access='read' />
    </interface>
</node>`;

const MprisPlayerProxy = Gio.DBusProxy.makeProxyWrapper(PlayerIFace);
const MprisProxy = Gio.DBusProxy.makeProxyWrapper(MprisIFace);
const DBusProxy = Gio.DBusProxy.makeProxyWrapper(imports.misc.fileUtils.loadInterfaceXML('org.freedesktop.DBus'));


var Player = GObject.registerClass({
    GTypeName: 'Player',
    Signals: {
        'closed': {
            flags: GObject.SignalFlags.RUN_FIRST,
        },
        'updated': {
            flags: GObject.SignalFlags.RUN_LAST,
        },
    }
},
class Player extends St.BoxLayout{
    _init(busName){
        super._init({
            style_class: 'db-container',
        });
        this._mprisProxy = new MprisProxy(
            Gio.DBus.session,
            busName,
            '/org/mpris/MediaPlayer2',
            this._onMprisProxyReady.bind(this));
        this._playerProxy = new MprisPlayerProxy(
            Gio.DBus.session,
            busName,
            '/org/mpris/MediaPlayer2',
            this._onPlayerProxyReady.bind(this));

        this._busName = busName;
        this._trackArtists = [];
        this._trackTitle = '';
        this._trackCoverUrl = '';

        this._playBackStatus = '';
        this._shuffle = '';
        this._loopStatus = '';
        this._volume = 0;

        this.mediaCover = new St.Button({
            style_class: 'db-media-cover',
            // style: 'background-image: url("' + 'this.mediaCoverImg' + '"); background-size: cover;',
        });
        this.mediaTitle = new St.Label({
            text: 'track',
            y_expand: true,
        });
        this.mediaArtist = new St.Label({
            text: 'artist',
            y_expand: true,
        });

        this.shuffleBtn   = new St.Button({ can_focus: true, y_align: Clutter.ActorAlign.CENTER, style_class: 'db-btn', });
        this.prevBtn      = new St.Button({ can_focus: true, y_align: Clutter.ActorAlign.CENTER, style_class: 'db-btn', });
        this.playPauseBtn = new St.Button({ can_focus: true, y_align: Clutter.ActorAlign.CENTER, style_class: 'db-btn', });
        this.nextBtn      = new St.Button({ can_focus: true, y_align: Clutter.ActorAlign.CENTER, style_class: 'db-btn', });
        this.loopBtn      = new St.Button({ can_focus: true, y_align: Clutter.ActorAlign.CENTER, style_class: 'db-btn', });

        this.shuffleIcon = new St.Icon({ icon_name: 'media-playlist-shuffle-symbolic', style_class: 'db-media-icon'});
        this.prevIcon = new St.Icon({ icon_name: 'media-skip-backward-symbolic',       style_class: 'db-media-icon db-player-icon'});
        this.playPauseIcon = new St.Icon({ icon_name: 'media-playback-start-symbolic', style_class: 'db-media-icon db-player-icon'});
        this.nextIcon = new St.Icon({ icon_name: 'media-skip-forward-symbolic',        style_class: 'db-media-icon db-player-icon'});
        this.loopIcon = new St.Icon({ icon_name: 'media-playlist-repeat-symbolic',     style_class: 'db-media-icon'});

        this.shuffleBtn.set_child(this.shuffleIcon);
        this.prevBtn.set_child(this.prevIcon);
        this.playPauseBtn.set_child(this.playPauseIcon);
        this.nextBtn.set_child(this.nextIcon);
        this.loopBtn.set_child(this.loopIcon);

        this.volumeIcon = new St.Icon({ icon_name: 'audio-volume-high-symbolic', });
        this.volumeSlider = new Slider.Slider(this._volume);

        this.bindings = [
            this.shuffleBtn.connect('clicked', () => this.shuffle() ),
            this.loopBtn.connect('clicked', () => this.loop() ),
            this.prevBtn.connect('clicked', () => this.prev() ),
            this.nextBtn.connect('clicked', () => this.next() ),
            this.playPauseBtn.connect('clicked', () => this.playPause() ),
            this.mediaCover.connect('clicked', () => this.raise() ),
            this.volumeSlider.connect('notify::value',
                                       () => { this._playerProxy.Volume = this.volumeSlider.value; }),
        ];

        //Build UI
        this.vertical = false;
        this.y_expand = true;
        this.mediaCover.y_align = Clutter.ActorAlign.CENTER;
        this.add_child(this.mediaCover);
        this.rightBox = new St.BoxLayout({
            style_class: 'db-container db-media-right-box',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            vertical: true,
        });
        this.add_child(this.rightBox);

        this.titleBox = new St.BoxLayout({
            vertical: true,
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
            style: 'text-align: center',
        });
        this.mediaTitle.y_align = Clutter.ActorAlign.END;
        this.mediaArtist.y_align = Clutter.ActorAlign.START;
        this.titleBox.add_child(this.mediaTitle);
        this.titleBox.add_child(this.mediaArtist);
        this.rightBox.add_child(this.titleBox);
        //
        this.controlsBox = new St.BoxLayout({
            style_class: 'db-container',
            x_expand: true, 
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.controlsBox.add_child(this.shuffleBtn);
        this.controlsBox.add_child(this.prevBtn);
        this.controlsBox.add_child(this.playPauseBtn);
        this.controlsBox.add_child(this.nextBtn);
        this.controlsBox.add_child(this.loopBtn);
        this.rightBox.add_child(this.controlsBox);
        //
        this.volumeBox = new St.BoxLayout({
            style_class: 'db-container db-slider',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.volumeBox.add_child(this.volumeIcon);
        this.volumeBox.add_child(this.volumeSlider);
        this.rightBox.add_child(this.volumeBox);
    }
    _close() {
        this._mprisProxy.disconnectObject(this);
        this._mprisProxy = null;
        this._playerProxy.disconnectObject(this);
        this._playerProxy = null;

        this.emit('closed');
    }
    _onMprisProxyReady(){
        this._mprisProxy.connectObject('notify::g-name-owner',
            () => {
                if (!this._mprisProxy.g_name_owner)
                    this._close();
            }, this);
        if (!this._mprisProxy.g_name_owner)
            this._close();
    }
    _onPlayerProxyReady(){
        this._playerProxy.connectObject(
            'g-properties-changed', () => this._updateState(), this);
        this._updateState();
    }
    _updateState(){
        let metadata = {};
        for (let prop in this._playerProxy.Metadata)
            metadata[prop] = this._playerProxy.Metadata[prop].deep_unpack();

        this._trackArtists = metadata['xesam:artist'];
        if (!Array.isArray(this._trackArtists) ||
            !this._trackArtists.every(artist => typeof artist === 'string')) {
            this._trackArtists =  [_("Unknown artist")];
        }
        this._trackTitle = metadata['xesam:title'];
        if (typeof this._trackTitle !== 'string') {
            this._trackTitle = _("Unknown title");
        }
        this._trackCoverUrl = metadata['mpris:artUrl'];
        if (typeof this._trackCoverUrl !== 'string') {
            this._trackCoverUrl = '';
        }
        this._playBackStatus = this._playerProxy.PlaybackStatus;
        this._shuffle = this._playerProxy.Shuffle;
        this._loopStatus = this._playerProxy.LoopStatus;
        this._volume = this._playerProxy.Volume;

        this.volumeSlider.value = this._volume;

        if(this.mediaCover.length === 0){
            this.mediaCover.style = 'background-image: none';
            this.mediaCoverDummy = new St.Icon({ icon_name: 'applications-multimedia-symbolic', });
            this.mediaCover.set_child(this.mediaCoverDummy);
        }
        else { 
            this.mediaCover.remove_all_children();
            this.mediaCover.style = 'background-image: url("' + this._trackCoverUrl + '"); background-size: cover;';
        }
        this.mediaTitle.text = this._trackTitle;
        this.mediaArtist.text = this._trackArtists.join(', ');

        if(this._shuffle) this.shuffleIcon.add_style_pseudo_class('active');
        else this.shuffleIcon.remove_style_pseudo_class('active');

        if(this._playerProxy.CanGoPrevious) this.prevIcon.add_style_pseudo_class('active');
        else this.prevIcon.remove_style_pseudo_class('active');

        if(this._playerProxy.CanGoNext) this.nextIcon.add_style_pseudo_class('active');
        else this.nextIcon.remove_style_pseudo_class('active');

        if(this._playerProxy.CanPlay) this.playPauseIcon.add_style_pseudo_class('active');
        else this.playPauseIcon.remove_style_pseudo_class('active');

        switch (this._playBackStatus) {
            case "Playing":
                this.playPauseIcon.icon_name = 'media-playback-pause-symbolic';
                break;
            case "Paused":
                this.playPauseIcon.icon_name = 'media-playback-start-symbolic';
                break;
            case "Stopped":
                this.playPauseIcon.icon_name = 'media-playback-start-symbolic';
                break;
            default:
                break;
        }

        switch (this._loopStatus) {
            case "None":
                this.loopIcon.icon_name = 'media-playlist-repeat-symbolic';
                this.loopIcon.remove_style_pseudo_class('active');
                break;
            case "Track":
                this.loopIcon.icon_name = 'media-playlist-repeat-symbolic';
                this.loopIcon.add_style_pseudo_class('active');
                break;
            case "Playlist":
                this.loopIcon.icon_name = 'media-playlist-repeat-song-symbolic';
                this.loopIcon.add_style_pseudo_class('active');
                break;
            default:
                break;
        }

        if(this._volume < 0.1) this.volumeIcon.icon_name = 'audio-volume-muted-symbolic';
        if(this._volume >= 0.1 && this._volume < 0.33 ) this.volumeIcon.icon_name = 'audio-volume-low-symbolic';
        if(this._volume >= 0.33 && this._volume < 0.66 ) this.volumeIcon.icon_name = 'audio-volume-medium-symbolic';
        if(this._volume >= 0.66 ) this.volumeIcon.icon_name = 'audio-volume-high-symbolic';

        this.emit('updated');
    }

    playPause(){ this._playerProxy.PlayPauseRemote(); }
    next(){ this._playerProxy.NextRemote(); }
    prev(){ this._playerProxy.PreviousRemote(); }
    shuffle(){ this._playerProxy.Shuffle = !this._playerProxy.Shuffle; }
    loop(){
        switch (this._playerProxy.LoopStatus) {
          case "None":
              this._playerProxy.LoopStatus = "Track";
              break;
          case "Track":
              this._playerProxy.LoopStatus = "Playlist";
              break;
          case "Playlist":
              this._playerProxy.LoopStatus = "None";
              break;
          default:
              break;
        }
    }
    raise() {
        let app = null;
        if (this._mprisProxy.DesktopEntry) {
            let desktopId = `${this._mprisProxy.DesktopEntry}.desktop`;
            app = Shell.AppSystem.get_default().lookup_app(desktopId);
        }

        if (app)
            app.activate();
        else if (this._mprisProxy.CanRaise)
            this._mprisProxy.RaiseRemote();
    }
});

var Media = GObject.registerClass({
    GTypeName: 'Media',
    Signals: {
        'updated': {
            flags: GObject.SignalFlags.RUN_FIRST,
        }
    }
}, class Media extends St.Bin{
    _init(){
        super._init();
        this._players = new Map();
        this._proxy = new DBusProxy(Gio.DBus.session,
                                    'org.freedesktop.DBus',
                                    '/org/freedesktop/DBus',
                                    this._onProxyReady.bind(this));
    }
    _addPlayer(busName) {
        if (this._players.get(busName))
            return;

        let player = new Player(busName);
        this._players.set(busName, player);
        player.connect('closed',
            () => {
                this._players.delete(busName);
                this.emit('updated');
            });
        this.emit('updated');
    }
    _onProxyReady() {
        this._proxy.ListNamesRemote(([names]) => {
            names.forEach(name => {
                if (!name.startsWith('org.mpris.MediaPlayer2.'))
                    return;

                this._addPlayer(name);
            });
        });
        this._proxy.connectSignal('NameOwnerChanged',
                                  this._onNameOwnerChanged.bind(this));
        this.emit('proxy-ready');
    }
    _onNameOwnerChanged(proxy, sender, [name, oldOwner, newOwner]) {
        if (!name.startsWith('org.mpris.MediaPlayer2.'))
            return;
        if (newOwner && !oldOwner)
            this._addPlayer(name);
    }
    getFavPlayer(){
        if(this._players.size === 0){
            return false;
        }
        this._players.forEach((player, busName) => {
            if(busName.includes('spotify')){
                return player;
            }
        });
        const iterator = this._players.values();
        return iterator.next().value;
    }
});