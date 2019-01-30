var defaultPath = null;
var isSutoSave = true;
var fs = require('fs');
var { remote, globalShortcut, shell } = require('electron');
var { dialog, Menu, app } = require('electron').remote;
var { BrowserWindow, Menu, MenuItem } = require('electron').remote;    
var http = require('http');
var path = require('path');       
var os = require('os');
var platform = os.platform();
var confPath = path.join(getUserDataDir(), '/naotu.config.json');
var unzip = require('unzip2');
var convert = require('xml-js');
var xmindDefault = (app || remote.app).getPath('userData');

$(function () {
    bootbox.setLocale("zh_CN");    
    try {
        // 若没有用户文件夹，则创建
        var defFolder = path.join(getUserDataDir(), '/');
        if (!fs.existsSync(defFolder)) {
            fs.mkdirSync(defFolder);
        }
        // 检查或创建配置文件
        fs.exists(confPath, function (exists) {
            if(!exists){
                fs.writeFileSync(confPath, JSON.stringify(getDefConf()));
            }
        });
    } catch (ex) {
        //错误日志
    }
});

// 重选自动保存的目录
function setSavePath() {
    try {        
        var defPath = getUserDataDir();
        var confObj = JSON.parse(fs.readFileSync(confPath));
        defPath = confObj.defSavePath;
        dialog.showOpenDialog({properties: ['openDirectory'], defaultPath : defPath}, function (filenames) {
            if (filenames && filenames.length > 0) { 
                confObj.defSavePath = filenames[0];
                fs.writeFileSync(confPath, JSON.stringify(confObj));
            }
        });
    } catch (ex) {
        //错误日志
    }
}

function readFile(fileName) {
    if (!fileName) return;    
    defaultPath = fileName;
    fs.readFile(fileName, 'utf8', function (err, data) {                
        var json = JSON.parse(data);
        editor.minder.importJson(json);
        showFileName(fileName);
    });
    saveRecords(defaultPath);
}

function writeFile(fileName, content, isExport) {
    if (!fileName) return;    
    fs.writeFile(fileName, content, function (err) {
        if (err) {
            //错误日志
        } else {
            showFileName(fileName);
        }
    });
    if(!isExport){
        saveRecords(fileName);
    }
}

// 新建文件
function newDialog() {    
    if (hasData()) {
        bootbox.confirm({
            message: '新建文件会关闭当前文件，是否继续？',
            callback: function (result) {
                if (result) {
                    initRoot();
                }
            }
        });
    } else {
        initRoot();
    }
}

function hasData() {
    var nodes = editor.minder.getAllNode().length;
    var rootText = editor.minder.getRoot().data.text;
    return nodes != 1 || rootText != '中心主题';
}

function initRoot() {
    defaultPath = null;
    getAppInstance().setTitle('百度脑图');
    editor.minder.importJson({ "root": { "data": { "text": "中心主题" } }, "template": "filetree", "theme": "fresh-blue" });
    editor.minder.select(minder.getRoot(), true);
}

// 自动保存
function autoSave(obj) {
    isSutoSave = obj.checked;
}

// 打开文件
function openDialog() {
    dialog.showOpenDialog(
        { filters: [
            { name: '(*.km 或 *.xmind)', extensions: ['km', 'xmind'] },
        ] },
        (fileName) => {                                    
            if (!fileName) { return; }             
            let fileExtension = fileName[0].substring(fileName[0].lastIndexOf('.') + 1);         
            if (fileExtension == 'xmind') {                
                readXmindFile(fileName[0], data => {
                    readFile(data);
                });
            } else {
                readFile(fileName[0]);
            }            
        }
    );
}

function readXmindFile (xmindFile, callback) { 
    
    // xmindAction 文件夹
    let firstPath = path.join(xmindDefault, '/tmXmindAction');
    let secondPath = path.join(xmindDefault, '/tmXmindAction/content.xml');
    if (!fs.existsSync(firstPath)) {
        fs.mkdirSync(firstPath);
    } 

    // 解压 unzip
    let unzip_extract = unzip.Extract({ path: firstPath });
    //监听解压缩、传输数据过程中的错误回调
    unzip_extract.on('error',(err)=>{
        console.log(err);
    });
    //监听解压缩、传输数据结束
    unzip_extract.on('finish',()=>{
        console.log('解压完成');
    });
    unzip_extract.on('close',()=>{        
        var xml = fs.readFileSync(secondPath, 'utf8');
        var options = { ignoreComment: true, compact: true };
        var result = convert.xml2js(xml, options);               
        let json = {
            root: {
                data: {
                    text: ''
                },
                children: []
            },
            template: 'default',
            theme: 'fresh-blue',
            version: '1.4.43'
        };
        let content = result["xmap-content"];
        if (content.sheet.topic) {
            json.root.data.text = content.sheet.topic.title._text;
        }
        json.root.children = getchildren(content.sheet.topic.children);        
        // tostring
        let str = JSON.stringify(json);   
        // 得到路径
        let strPath = xmindFile.substring(0, xmindFile.lastIndexOf('.')) + '.km';
        // strPath = duplicateName(strPath, 0, md); // md 为xmind 的
        // 存为 km文件
        fs.writeFileSync(strPath, str);  
        callback(strPath);        
    });
    fs.createReadStream(xmindFile).pipe(unzip_extract);             
}

// function duplicateName (pathName, num, md) {    
//     if (fs.existsSync(pathName)) {
//         // 对比 md5 
//         if ('相等') {
//             return pathName;
//         } else {
//             let numb = num + 1;
//             let ttpath = pathName.substring(0, pathName.file.lastIndexOf('.')) + `(${numb})` + `.km`;
//             ttpath = duplicateName(ttpath, numb, md);
//             return ttpath;
//         }        
//     }
//     return pathName;
// }

function getchildren (children) {
    let childrenArray = [];
    if (children) {
        let topics = children.topics;
        let topic = children.topics.topic;
        if (Array.isArray(topics)) {
            topic = [];
            for (let item of topics) {
                if (Array.isArray(item.topic)) {
                    for (let i of item.topic) {
                        topic.push(i);
                    }
                } else {
                    topic.push(item.topic);
                }                
            }
        }
        if (Array.isArray(topic)) {
            for (let item of topic) {
                if (!item.title) {
                    item.title = { _text: 'null' };
                }
                if (!item.children) {
                    let childrenItem = {
                        data: {
                            text: item.title._text
                        },
                        children: []
                    };
                    childrenArray.push(childrenItem);
                } else {                    
                    let childrenItem = {
                        data: {
                            text: item.title._text
                        },
                        children: []
                    };
                    childrenItem.children = this.getchildren(item.children);
                    childrenArray.push(childrenItem);
                }
            }
        } else {
            let childrenItem = {
                data: {
                    text: topic.title._text
                },
                children: []
            };
            if (topic.children) {
                childrenItem.children = this.getchildren(topic.children);
            }
            childrenArray.push(childrenItem);                            
        }        
    }
    return childrenArray;
}

// 在文件夹中打开文件
function openFileInFolder() {
    if (defaultPath != null) {
        shell.showItemInFolder(defaultPath);
    } else {
        bootbox.alert("您当前还未打开任何文件。");
    }
}

// 保存
function saveDialog() {
    if (!defaultPath) {
        defaultPath = getDefaultPath();
    }
    var json = editor.minder.exportJson();
    var data = JSON.stringify(editor.minder.exportJson());
    writeFile(defaultPath, data);
}

// 另存为
function saveAsDialog() {
    var newPath = path.join(getUserDataDir(), '/' + minder.getRoot().data.text + '.km');
    dialog.showSaveDialog(
        {
            title: "保存 KityMinder 文件",
            defaultPath: newPath,
            filters: [{ name: 'KityMinder', extensions: ['km'] }]
        },
        (fileName) => {
            if (!fileName) { return; }// cancel save
            defaultPath = fileName;
            var json = editor.minder.exportJson();
            var data = JSON.stringify(editor.minder.exportJson());
            writeFile(fileName, data);
        }
    );
}

// 导出
function exportDialog() {
    var newPath = path.join(getUserDataDir(), '/' + minder.getRoot().data.text);
    var filters = [];
    var pool = kityminder.data.getRegisterProtocol();
    console.log(pool);    
    for (var name in pool) {
        if (pool.hasOwnProperty(name) && pool[name].encode) {
            filters.push({ name: pool[name].fileDescription, extensions: [pool[name].fileExtension.replace('.', '')] });
        }
    }
    dialog.showSaveDialog(
        {
            title: "导出 KityMinder 文件",
            defaultPath: newPath,
            filters: filters
        },
        (fileName) => {
            if (!fileName) { return; }// cancel export
            var ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
            var protocol = null;
            var pool = kityminder.data.getRegisterProtocol();
            for (var name in pool) {
                if (pool.hasOwnProperty(name) && pool[name].encode) {
                    if (pool[name].fileExtension === ext) {
                        protocol = pool[name];
                        break;
                    }
                }
            }
            exportFile(protocol, fileName)
        }
    );
}

// 退出
function exitApp() {
    app.quit();
}

// 恢复
function redo() {
    editor.history.redo();
}

// 撤销
function undo() {
    editor.history.undo();
}

// 剪切
function cut() {
    minder.execCommand('Cut');
}

// 复制
function copy() {
    minder.execCommand('Copy');
}

// 粘贴
function paste() {
    minder.execCommand('Paste');
}

// 查看帮助
function license() {    
    var text = `    
A.文件保存位置：
    1、默认保存路径为上一次文件保存位置，若找不到位置，可先编辑当前脑图，文件位置自动同步
    2、可根据 -重选自动保存的目录- 方便管理脑图文件 
B.支持 Xmind
    1、导入 .xmind 文件不会改变原文件，会新建 .km 文件进行编辑
    `;
    dialog.showMessageBox({ type: "none", title: "百度脑图", message: text, buttons: ["OK"] });
}

// 关于
function about() {
    var text = `
    Copyright (c) 2018 IT - www.opscaff.com

    版本： 1.0.1
    `;
    dialog.showMessageBox({ type: "info", title: "百度脑图", message: text, buttons: ["OK"] });
}

// 快捷键
function shortcut() {
    var shortcutKeys = [
        {
            groupName: '节点操作',
            groupItem: [
                { key: "Enter", desc: " 插入兄弟节点" },
                { key: "Tab, Insert", desc: " 插入子节点" },
                { key: "Shift + Tab", desc: " 插入父节点" },
                { key: "Delete", desc: " 删除节点" },
                { key: "Up, Down, Left, Right", desc: " 节点导航" },
                { key: "Alt + Up, Down", desc: " 向上/向下调整顺序" },
                { key: "/", desc: " 展开/收起节点" },
                { key: "F2", desc: " 编辑节点" },
                { key: "Shift + Enter", desc: " 文本换行" },
                { key: "Ctrl + A", desc: " 全选节点" },
                { key: "Ctrl + C", desc: " 复制节点" },
                { key: "Ctrl + X", desc: " 剪切节点" },
                { key: "Ctrl + V", desc: " 粘贴节点" },
                { key: "Ctrl + B", desc: " 加粗" },
                { key: "Ctrl + I", desc: " 斜体" },
                { key: "Ctrl + F", desc: " 查找节点" }
            ]
        }, {
            groupName: '视野控制',
            groupItem: [
                //{ key:"Ctrl + ESC",desc:" 全屏切换"},
                { key: "Alt + 拖动, 右键拖动", desc: " 拖动视野" },
                { key: "滚轮, 触摸板", desc: " 移动视野" },
                //{ key:"Ctrl + Up, Down, Left, Right",desc:" 视野导航"},
                { key: "空白处双击, Ctrl + Enter", desc: " 居中根节点" },
                { key: "Ctrl + +, -", desc: " 放大/缩小视野" }
            ]
        }, {
            groupName: '文件操作',
            groupItem: [
                { key: "Ctrl + O", desc: " 打开" },
                { key: "Ctrl + S", desc: " 保存" },
                { key: "Ctrl + Shift + S", desc: " 另存为" },
                // { key: "Ctrl + Alt + S", desc: " 分享" }
            ]
        }, {
            groupName: '布局',
            groupItem: [
                { key: "Ctrl + Shift + L", desc: " 整理布局" }
            ]
        }, {
            groupName: '后悔药',
            groupItem: [
                { key: "Ctrl + Z", desc: " 撤销" },
                { key: "Ctrl + Y", desc: " 重做" }
            ]
        }
    ];
    var text = "";
    for (var i = 0; i < shortcutKeys.length; i++) {
        var group = shortcutKeys[i];
        text += `\n` + group.groupName + `\n`;
        for (var j = 0; j < group.groupItem.length; j++) {
            var item = group.groupItem[j];
            text += `       ` + item.desc + `   ` + item.key + `\n`;
        }
    }
    dialog.showMessageBox({ type: "none", title: "快捷键", message: text, buttons: ["OK"] });
}

function exportFile(protocol, filename) {
    var options = {
        download: true,
        filename: filename
    };
    minder.exportData(protocol.name, options).then(function (data) {
        switch (protocol.dataType) {
            case 'text':
                writeFile(filename, data, true);
                break;
            case 'base64':
                var base64Data = data.replace(/^data:image\/\w+;base64,/, "");
                var dataBuffer = new Buffer(base64Data, 'base64');

                writeFile(filename, dataBuffer, true);
                break;
            case 'blob':
                break;
        }
        return null;
    });
}

function getDefaultPath() {
    try {
        var time = new Date().format("yyyy-MM-dd_hhmmss");
        var confObj = JSON.parse(fs.readFileSync(confPath));
        var defPath = confObj.defSavePath || getUserDataDir();        
        // 若没有用户文件夹，则创建
        fs.exists(defPath, (exists) => {
            if (!exists) {
                fs.mkdir(defPath)
            }
        });
        var filePath = path.join(defPath, '/' + time + '.km');        
        return filePath;
    } catch (ex) {
        //错误日志
    }
}

function getUserDataDir() {
    return (app || remote.app).getPath('userData');
}

function showFileName(fileName) {
    if (fileName != undefined) {
        var index = fileName.lastIndexOf('\\') > -1 ? fileName.lastIndexOf('\\') : fileName.lastIndexOf('/');
        var title = fileName.substring(index + 1) + ' - 百度脑图';
        getAppInstance().setTitle(title);
    }
}

function getAppInstance() {
    return BrowserWindow.getAllWindows()[0];
}

function getDefConf(){
    return {
        'defSavePath': getUserDataDir(),
        'recently': []
    };
}

// 清除最近打开记录
function clearRecently() {
    try {
        // 读取配置文件
        var confObj = JSON.parse(fs.readFileSync(confPath));
        if(confObj != null){
            // 清空历史记录的列表
            confObj.recently = [];
            fs.writeFileSync(confPath, JSON.stringify(confObj));
        } else {
            // 读失败了，则创建一个默认的配置文件
            fs.writeFileSync(confPath, JSON.stringify(getDefConf()));
        }
        // 更新菜单
        updateMenus();
    } catch (ex) {
        //错误日志
    }
};

function saveRecords(filePath) {
    var time = new Date().format("yyyy-MM-dd hh:mm:ss");
    fs.exists(confPath, function (exists) {
        if (!exists) {// 不存在，则创建
            var confObj = getDefConf();
            confObj.recently.push({ 'time': time, 'path': filePath });
            fs.writeFileSync(confPath, JSON.stringify(confObj));
        } else {// 存在，则读取
            var confObj = JSON.parse(fs.readFileSync(confPath));
            var list = confObj.recently;
            // 查重
            var items = [], selected = null;
            for (var i = 0; i < list.length; i++) {
                var item = list[i];
                if (item.path == filePath) {
                    selected = item;
                } else {
                    items.push(item);
                }
            }
            if (selected == null) {
                items.splice(0, 0, { 'time': time, 'path': filePath });
            } else {// 在原来的清单中，则更新
                selected.time = time;
                items.splice(0, 0, selected);
            }
            confObj.recently = items;
            // 更新列表
            fs.writeFileSync(confPath, JSON.stringify(confObj));
        }
    });
    // 更新菜单
    updateMenus();
}

function updateMenus() {
    fs.exists(confPath, function (exists) {
        if (exists) {// 存在，则读取
            // 深度复制
            var menus = $.extend(true, [], template);
            var confObj = JSON.parse(fs.readFileSync(confPath));
            var list = confObj.recently;
            for (var i = 0; i < Math.min(list.length, 5); i++) {// 只显示最近5次
                var item = list[i];
                if (platform == 'darwin') {
                    // 追加到菜单
                    menus[1].submenu[4].submenu.splice(menus[1].submenu[4].submenu.length - 2, 0, {
                        label: item.path,
                        click: openRecently
                    });
                } else {
                    // 追加到菜单
                    menus[0].submenu[4].submenu.splice(menus[0].submenu[4].submenu.length - 2, 0, {
                        label: item.path,
                        click: openRecently
                    });
                }                
            }
            // 更新菜单
            var menu = Menu.buildFromTemplate(menus);
            Menu.setApplicationMenu(menu);
        } else {
            var menu = Menu.buildFromTemplate(template);
            Menu.setApplicationMenu(menu);
        }
    });
}

function openRecently(item) {
    var path = item.label;
    if (path) {
        fs.exists(path, function (result) {
            if (result) {// 存在，则读取
                readFile(path);
            } else {
                bootbox.alert("文件路径不存在");
            }
        });
    }
}


// https://www.cnblogs.com/tugenhua0707/p/3776808.html
// var time1 = new Date().format("yyyy-MM-dd hh:mm:ss");
// console.log(time1);
Date.prototype.format = function (fmt) {
    var o = {
        "M+": this.getMonth() + 1,               //月份
        "d+": this.getDate(),                    //日
        "h+": this.getHours(),                   //小时
        "m+": this.getMinutes(),                 //分
        "s+": this.getSeconds(),                 //秒
        "q+": Math.floor((this.getMonth() + 3) / 3), //季度
        "S": this.getMilliseconds()             //毫秒
    };
    if (/(y+)/.test(fmt)) {
        fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
    }
    for (var k in o) {
        if (new RegExp("(" + k + ")").test(fmt)) {
            fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
        }
    }
    return fmt;
}
// window.$ = window.jQuery = require('../bower_components/jquery/dist/jquery.min.js');
window.$ = window.jQuery = require('./js/jquery.min.js');

var remote = require('electron').remote,
    argv = remote.getGlobal('sharedObject').prop1;

angular.module('kityminderDemo', ['kityminderEditor']).config(function (configProvider) {
    configProvider.set('imageUpload', '../server/imageUpload.php');

    if (argv.length >= 2) {
        let filePath = argv[1];

        //open, read, handle file
        if (filePath.indexOf('km') > -1) {
            readFile(filePath);
        }
    }

}).controller('MainController', function ($scope, $modal) {
    $scope.initEditor = function (editor, minder) {
        window.editor = editor;
        window.minder = minder;
    };
});

window.$(function () {
    if (minder != null) {// auto saving
        minder.on('contentchange', function () {
            if (isSutoSave) {
                saveDialog();
            }
        });

        minder.on('selectionchange', function () {
            var node = minder.getSelectedNode();

            // 对编辑菜单进行管理
            menu.items[1].submenu.items[3].enabled =
                menu.items[1].submenu.items[4].enabled =
                menu.items[1].submenu.items[5].enabled = !!node;

        });
    }
});
var remote = require('electron').remote;
var Menu = remote.Menu;
var os = require('os');
var platform = os.platform();

var template = [{
    label: '百度脑图',    
    submenu: [        
        {
            label: '退出',
            accelerator: 'Cmd+Q',
            click: exitApp
        }        
    ]
},{
    label: '文件(&F)',
    submenu: [
        {
            label: '新建文件(&N)',
            accelerator: 'CmdOrCtrl+N',
            click: newDialog
        },
        {
            label: '打开文件(&O)',
            accelerator: 'CmdOrCtrl+O',
            click: openDialog
        },
        { type: 'separator' },
        {
            // label: '在文件夹中打开文件(&L)',
            label: '文件位置...(&L)',
            accelerator: 'CmdOrCtrl+Shift+O',
            click: openFileInFolder
        },
        {
            label: '打开最近的文件(&R)',
            submenu: [
                { type: 'separator' },
                {
                    id: 1,
                    label: '清除最近打开记录',
                    click: clearRecently
                }
            ]
        },
        { type: 'separator' },
        {
            label: '保存(&S)',
            accelerator: 'CmdOrCtrl+S',
            click: saveDialog
        },
        {
            label: '另存为(&A)...',
            accelerator: 'CmdOrCtrl+Shift+S',
            click: saveAsDialog
        },
        {
            label: '导出(&E)...',
            accelerator: 'CmdOrCtrl+E',
            click: exportDialog
        },
        { type: 'separator' },
        {
            label: '自动保存',
            type: 'checkbox',
            checked: true,
            click: autoSave
        },
        {
            label: '重选自动保存的目录(&R)',
            accelerator: 'CmdOrCtrl+R',
            click: setSavePath
        }        
    ]
}, {
    label: "编辑(&E)",
    submenu: [
        {
            label: "撤销(&U)",
            accelerator: 'CmdOrCtrl+Z',
            click: undo,
            selector: 'undo:'
        },
        {
            label: "恢复(&R)",
            accelerator: 'CmdOrCtrl+Y',
            click: redo,
            selector: 'redo:'
        },
        { type: 'separator' },
        {
            label: "剪切(&T)",
            accelerator: 'CmdOrCtrl+X',
            selector: 'cut:',
            role: 'cut'
        },
        {
            label: "复制(&C)",
            accelerator: 'CmdOrCtrl+C',
            selector: 'copy:',
            role: 'copy'
        },
        {
            label: "粘贴(&P)",
            accelerator: 'CmdOrCtrl+V',
            selector: 'paste:',
            role: 'paste'
        }
    ]
}, {
    label: "帮助(&H)",
    submenu: [
        {
            label: '快捷键(&H)...',
            accelerator: 'CmdOrCtrl+/',
            click: shortcut
        },
        { type: 'separator' },
        { label: "查看帮助(&V)", click: license },                
        { label: "关于(&A)", click: about }
    ]
}];

if (platform != 'darwin') {
    // template 去除第一个元素
    template.splice(0, 1);
}

var menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);

// 允许通过拖拽打开文件 
var body = document.body;

body.ondrop = function (e) {
    e.preventDefault();
    var file = e.dataTransfer.files[0];
    // if (!file.name.toLowerCase().endsWith(".km")) {
    //     bootbox.alert("加载文件失败！只允许打开.km格式的文件！")
    //     return false;
    // }
    let fileExtension = file.path.substring(file.path.lastIndexOf('.') + 1);         
    if (fileExtension == 'xmind') {                
        readXmindFile(file.path, data => {
            readFile(data);
        });
    } else {
        readFile(file.path);
    } 
    // readFile(file.path);

    return false;
};

body.ondragover = body.ondragleave = body.ondragend = function () {
    return false;
};
/**
 * @fileOverview FreeMind 文件格式支持
 *
 * Freemind 文件后缀为 .mm，实际上是一个 XML 文件
 * @see http://freemind.sourceforge.net/
 */
kityminder.data.registerProtocol('freemind', function (minder) {
    // 标签 map
    var markerMap = {
        'full-1': ['priority', 1],
        'full-2': ['priority', 2],
        'full-3': ['priority', 3],
        'full-4': ['priority', 4],
        'full-5': ['priority', 5],
        'full-6': ['priority', 6],
        'full-7': ['priority', 7],
        'full-8': ['priority', 8]
    };

    function processTopic(topic, obj) {

        //处理文本
        obj.data = {
            text: topic.TEXT
        };
        var i;

        // 处理标签
        if (topic.icon) {
            var icons = topic.icon;
            var type;
            if (icons.length && icons.length > 0) {
                for (i in icons) {
                    type = markerMap[icons[i].BUILTIN];
                    if (type) obj.data[type[0]] = type[1];
                }
            } else {
                type = markerMap[icons.BUILTIN];
                if (type) obj.data[type[0]] = type[1];
            }
        }

        // 处理超链接
        if (topic.LINK) {
            obj.data.hyperlink = topic.LINK;
        }

        //处理子节点
        if (topic.node) {

            var tmp = topic.node;
            if (tmp.length && tmp.length > 0) { //多个子节点
                obj.children = [];

                for (i in tmp) {
                    obj.children.push({});
                    processTopic(tmp[i], obj.children[i]);
                }

            } else { //一个子节点
                obj.children = [{}];
                processTopic(tmp, obj.children[0]);
            }
        }
    }

    function xml2km(xml) {
        var json = $.xml2json(xml);
        var result = {};
        processTopic(json.node, result);
        return result;
    }

    return {
        fileDescription: 'Freemind 格式',
        fileExtension: '.mm',
        dataType: 'text',

        decode: function (local) {
            return new Promise(function (resolve, reject) {
                try {
                    resolve(xml2km(local));
                } catch (e) {
                    reject(new Error('XML 文件损坏！'));
                }
            });
        },

        encode: function (json, km, options) {
            // var url = 'native-support/export.php';

            return (
              '<map version="1.0.1">\n' +
                '<!-- To view this file, download free mind mapping software FreeMind from http://freemind.sourceforge.net -->\n' +
                genTopic(json.root) +
              '</map>\n'
            );

            function genTopic (root) {
              var data = root.data;
              var attrs = [
                ['CREATED', data.created],
                ['ID', data.id],
                ['MODIFIED', data.created],
                ['MODIFIED', data.created],
                ['TEXT', data.text],
                ['POSITION', data.position]
              ];
              return (
                '<node' + genAttrs(attrs) + '>\n' +
                  (root.children ? root.children.map(genTopic).join('\n') : '') +
                  (data.priority ? ('<icon BUILTIN="full-' + data.priority +'"/>\n') : '') +
                  (data.image ? (
                    '<richcontent TYPE="NODE"><html><head></head><body>\n' +
                      '<img' + genAttrs([['src', data.image], ['width', data.imageSize.width], ['height', data.imageSize.height]]) + '/>\n' +
                    '</body></html></richcontent>\n'
                  ) : '') +
                '</node>\n'
              );
            }

            function genAttrs (pairs) {
              return pairs.map(function (x) {
                return x[1] ? (' ' + x[0] + '="' + x[1] + '"') : ''
              }).join('');
            }

            // function fetch() {
            //     return new Promise(function(resolve, reject) {
            //         var xhr = new XMLHttpRequest();
            //         xhr.open('POST', url);

            //         xhr.responseType = 'blob';
            //         xhr.onload = resolve;
            //         xhr.onerror = reject;

            //         var form = new FormData();
            //         form.append('type', 'freemind');
            //         form.append('data', data);

            //         xhr.send(form);
            //     }).then(function(e) {
            //         return e.target.response;
            //     });
            // }

            // function download() {
            //     var filename = options.filename || 'freemind.mm';

            //     var form = document.createElement('form');
            //     form.setAttribute('action', url);
            //     form.setAttribute('method', 'POST');
            //     form.appendChild(field('filename', filename));
            //     form.appendChild(field('type', 'freemind'));
            //     form.appendChild(field('data', data));
            //     form.appendChild(field('download', '1'));
            //     document.body.appendChild(form);
            //     form.submit();
            //     document.body.removeChild(form);

            //     function field(name, content) {
            //         var input = document.createElement('input');
            //         input.type = 'hidden';
            //         input.name = name;
            //         input.value = content;
            //         return input;
            //     }
            // }

            // if (options && options.download) {
            //     return download();
            // } else {
            //     return fetch();
            // }
        }
    };

} ());

/* global zip:true */
/*
    http://www.mindjet.com/mindmanager/
    mindmanager的后缀为.mmap，实际文件格式是zip，解压之后核心文件是Document.xml
*/
kityminder.data.registerProtocol('mindmanager', function (minder) {

    // 标签 map
    var markerMap = {
        'urn:mindjet:Prio1': ['PriorityIcon', 1],
        'urn:mindjet:Prio2': ['PriorityIcon', 2],
        'urn:mindjet:Prio3': ['PriorityIcon', 3],
        'urn:mindjet:Prio4': ['PriorityIcon', 4],
        'urn:mindjet:Prio5': ['PriorityIcon', 5],
        '0': ['ProgressIcon', 1],
        '25': ['ProgressIcon', 2],
        '50': ['ProgressIcon', 3],
        '75': ['ProgressIcon', 4],
        '100': ['ProgressIcon', 5]
    };

    function processTopic(topic, obj) {
        //处理文本
        obj.data = {
            text: topic.Text && topic.Text.PlainText || ''
        }; // 节点默认的文本，没有Text属性

        // 处理标签
        if (topic.Task) {

            var type;
            if (topic.Task.TaskPriority) {
                type = markerMap[topic.Task.TaskPriority];
                if (type) obj.data[type[0]] = type[1];
            }

            if (topic.Task.TaskPercentage) {
                type = markerMap[topic.Task.TaskPercentage];
                if (type) obj.data[type[0]] = type[1];
            }
        }

        // 处理超链接
        if (topic.Hyperlink) {
            obj.data.hyperlink = topic.Hyperlink.Url;
        }

        //处理子节点
        if (topic.SubTopics && topic.SubTopics.Topic) {

            var tmp = topic.SubTopics.Topic;
            if (tmp.length && tmp.length > 0) { //多个子节点
                obj.children = [];

                for (var i in tmp) {
                    obj.children.push({});
                    processTopic(tmp[i], obj.children[i]);
                }

            } else { //一个子节点
                obj.children = [{}];
                processTopic(tmp, obj.children[0]);
            }
        }
    }

    function xml2km(xml) {
        var json = $.xml2json(xml);
        var result = {};
        processTopic(json.OneTopic.Topic, result);
        return result;
    }

    function getEntries(file) {
        return new Promise(function (resolve, reject) {
            zip.createReader(new zip.BlobReader(file), function (zipReader) {
                zipReader.getEntries(resolve);
            }, reject);
        });
    }

    function readMainDocument(entries) {

        return new Promise(function (resolve, reject) {

            var entry, json;

            // 查找文档入口
            while ((entry = entries.pop())) {

                if (entry.filename.split('/').pop() == 'Document.xml') break;

                entry = null;

            }

            // 找到了读取数据
            if (entry) {

                entry.getData(new zip.TextWriter(), function (text) {
                    json = xml2km($.parseXML(text));
                    resolve(json);
                });

            }

            // 找不到返回失败
            else {
                reject(new Error('Main document missing'));
            }

        });
    }

    return {
        fileDescription: 'MindManager 格式',
        fileExtension: '.mmap',
        dataType: 'blob',

        decode: function (local) {
            return getEntries(local).then(readMainDocument);
        },

        // 暂时不支持编码
        encode: null,

        recognizePriority: -1
    };
} ());
/* global zip:true */
/*
    http://www.xmind.net/developer/
    Parsing XMind file
    XMind files are generated in XMind Workbook (.xmind) format, an open format
    that is based on the principles of OpenDocument. It consists of a ZIP
    compressed archive containing separate XML documents for content and styles,
    a .jpg image file for thumbnails, and directories for related attachments.
 */
var path = require('path');
var fs = require('fs');
var archiver = require('archiver');

kityminder.data.registerProtocol('xmind', function(minder) {

    var xmindDefault = (app || remote.app).getPath('userData');

    // 标签 map
    var markerMap = {
        'priority-1': ['priority', 1],
        'priority-2': ['priority', 2],
        'priority-3': ['priority', 3],
        'priority-4': ['priority', 4],
        'priority-5': ['priority', 5],
        'priority-6': ['priority', 6],
        'priority-7': ['priority', 7],
        'priority-8': ['priority', 8],

        'task-start': ['progress', 1],
        'task-oct': ['progress', 2],
        'task-quarter': ['progress', 3],
        'task-3oct': ['progress', 4],
        'task-half': ['progress', 5],
        'task-5oct': ['progress', 6],
        'task-3quar': ['progress', 7],
        'task-7oct': ['progress', 8],
        'task-done': ['progress', 9]
    };

    function getMeta () {
        let meta = `        
        <?xml version="1.0" encoding="utf-8" standalone="no"?>
        <meta xmlns="urn:xmind:xmap:xmlns:meta:2.0" version="2.0">            
            <Creator>
                <Name>XMind</Name>
                <Version>R3.7.3.201708241944</Version>
            </Creator>
            <Thumbnail>
                <Origin>
                    <X>263</X>
                    <Y>162</Y>
                </Origin>
                <BackgroundColor>#FFFFFF</BackgroundColor>
            </Thumbnail>
        </meta>`;
        return meta;
    }

    function getManifest () {
        let manifest = `
        <?xml version="1.0" encoding="UTF-8" standalone="no"?>
        <manifest
            xmlns="urn:xmind:xmap:xmlns:manifest:1.0" password-hint="">
            <file-entry full-path="content.xml" media-type="text/xml"/>
            <file-entry full-path="META-INF/" media-type=""/>
            <file-entry full-path="META-INF/manifest.xml" media-type="text/xml"/>
            <file-entry full-path="meta.xml" media-type="text/xml"/>            
        </manifest>`;        
        return manifest;
    }

    function getContent (data) {
        let content = '';

        if (!data) {
            return '';
        }        

        if (data.root) {
            let childrenData = ``;
            let snapData = ``;

            if (data.root.children && data.root.children.length > 0) {
                for (let item of data.root.children) {                    
                    snapData = snapData + getContent(item);
                }
                childrenData = `
                <children>
                    <topics type="attached">
                        ${snapData} 
                    </topics>
                </children>`;                
            }

            content = `
            <?xml version="1.0" encoding="UTF-8" standalone="no"?>
            <xmap-content
                xmlns="urn:xmind:xmap:xmlns:content:2.0"
                xmlns:fo="http://www.w3.org/1999/XSL/Format"
                xmlns:svg="http://www.w3.org/2000/svg"
                xmlns:xhtml="http://www.w3.org/1999/xhtml"
                xmlns:xlink="http://www.w3.org/1999/xlink" timestamp="1544076877461" version="2.0">
            <sheet id="435gdt41vctnj56n8rv2qbkrcg" theme="1ema0e3kojt4ukk25cj6cp5ihn" timestamp="1544076877461">
            <topic id="${data.root.data.id}" structure-class="org.xmind.ui.map.unbalanced" timestamp="${data.root.data.created}">
                <title>${data.root.data.text}</title>
                ${childrenData}          
                <extensions>
                    <extension provider="org.xmind.ui.map.unbalanced">
                        <content>
                            <right-number>3</right-number>
                        </content>
                    </extension>
                </extensions>
            </topic>
            <title>画布 1</title>
                </sheet>
            </xmap-content>`;
        } else {  
            let partData = ``;
            let snapData = ``;    

            if (data.children && data.children.length > 0) {                
                for (let item of data.children) {
                    snapData = snapData + getContent(item);
                }        
                partData = `
                    <children>
                        <topics type="attached">
                            ${snapData}
                        </topics>
                    </children>`;
            }

            content = `                       
                <topic id="${data.data.id}" timestamp="${data.data.created}">
                    <title>${data.data.text}</title>
                    ${partData}                    
                </topic>`;  
        }
        return content;
    }

    function saveToXml (xml, type) {
        let firstPath = path.join(xmindDefault, '/mindMapXmind');
        let secondPath = path.join(xmindDefault, '/mindMapXmind/test');
        let thirdPath = path.join(xmindDefault, '/mindMapXmind/test/META-INF');
        if (!fs.existsSync(thirdPath)) {
            if (!fs.existsSync(secondPath)) {
                if (!fs.existsSync(firstPath)) {
                    fs.mkdirSync(firstPath);
                    fs.mkdirSync(secondPath);
                    fs.mkdirSync(thirdPath);
                }
            }
        }        
        
        let xmlPath = path.join(xmindDefault, `/mindMapXmind/test/${type}.xml`);
        if (type == 'manifest') {
            xmlPath = path.join(xmindDefault, `/mindMapXmind/test/META-INF/${type}.xml`);
        }

        fs.open(xmlPath, 'a', (err, fd) => {    
            if (err) {
                throw err;
            }
            fs.appendFile(fd, xml, 'utf8', (err) => {
                if (err) {
                    throw err;
                }        
                fs.close(fd, (err) => {
                    if (err) {
                        throw err;
                    }
                })       
            });
        });
    }

    function deleteXmlFile () {        
        let metaPath = path.join(xmindDefault, `/mindMapXmind/test/meta.xml`);        
        let contentPath = path.join(xmindDefault, `/mindMapXmind/test/content.xml`);
        let manifestPath = path.join(xmindDefault, `/mindMapXmind/test/META-INF/manifest.xml`);

        // meta
        if (fs.existsSync(metaPath)) {
            fs.unlink(metaPath, err => {
                if (err) {
                    throw err;
                }   
                console.log();             
            });
        }

        // content
        if (fs.existsSync(contentPath)) {
            fs.unlink(contentPath, err => {
                if (err) {
                    throw err;
                }
                console.log();
            });
        }

        // manifest
        if (fs.existsSync(manifestPath)) {
            fs.unlink(manifestPath, err => {
                if (err) {
                    throw err;                    
                }
                console.log();
            });
        }
        return ;
    }

    return {
        fileDescription: 'XMind 格式',
        fileExtension: '.xmind',
        dataType: 'blob',
        mineType: 'application/octet-stream',

        decode: function(local) {

            function processTopic(topic, obj) {

                //处理文本
                obj.data = {
                    text: topic.title
                };

                // 处理标签
                if (topic.marker_refs && topic.marker_refs.marker_ref) {
                    var markers = topic.marker_refs.marker_ref;
                    var type;
                    if (markers.length && markers.length > 0) {
                        for (var i in markers) {
                            type = markerMap[markers[i].marker_id];
                            if (type) obj.data[type[0]] = type[1];
                        }
                    } else {
                        type = markerMap[markers.marker_id];
                        if (type) obj.data[type[0]] = type[1];
                    }
                }

                // 处理超链接
                if (topic['xlink:href']) {
                    obj.data.hyperlink = topic['xlink:href'];
                }
                //处理子节点
                var topics = topic.children && topic.children.topics;
                var subTopics = topics && (topics.topic || topics[0] && topics[0].topic);
                if (subTopics) {
                    var tmp = subTopics;
                    if (tmp.length && tmp.length > 0) { //多个子节点
                        obj.children = [];

                        for (var i in tmp) {
                            obj.children.push({});
                            processTopic(tmp[i], obj.children[i]);
                        }

                    } else { //一个子节点
                        obj.children = [{}];
                        processTopic(tmp, obj.children[0]);
                    }
                }
            }

            function xml2km(xml) {
                var json = $.xml2json(xml);
                var result = {};
                var sheet = json.sheet;
                var topic = utils.isArray(sheet) ? sheet[0].topic : sheet.topic;
                processTopic(topic, result);
                return result;
            }

            function getEntries(file, onend) {
                return new Promise(function(resolve, reject) {                    
                    zip.createReader(new zip.BlobReader(file), function(zipReader) {
                        zipReader.getEntries(resolve);
                    }, reject);
                });
            }

            function readDocument(entries) {
                return new Promise(function(resolve, reject) {
                    var entry, json;

                    // 查找文档入口
                    while ((entry = entries.pop())) {

                        if (entry.filename.split('/').pop() == 'content.xml') break;

                        entry = null;

                    }

                    // 找到了读取数据
                    if (entry) {

                        entry.getData(new zip.TextWriter(), function(text) {
                            try {
                                json = xml2km($.parseXML(text));
                                resolve(json);
                            } catch (e) {
                                reject(e);
                            }
                        });

                    } 

                    // 找不到返回失败
                    else {
                        reject(new Error('Content document missing'));
                    }
                });
            }

            return getEntries(local).then(readDocument);

        },

        encode: function(json, km, options) {                        
            
            let fileName = options.filename || 'xmind.xmind';     

            saveToXml(getContent(json), 'content');
            saveToXml(getManifest(), 'manifest');
            saveToXml(getMeta(), 'meta');            
            
            let pathZip = path.join(xmindDefault, `/mindMapXmind/testXmind.zip`);
            let pathFile = path.join(xmindDefault, '/mindMapXmind/test/');              
            let pathxmind = fileName;
            let pathXmind = path.join(xmindDefault, `/mindMapXmind/${path.basename(pathxmind)}`);
            let output = fs.createWriteStream(pathZip);
            let archive = archiver('zip', {
                zlib: { level: 9 } // Sets the compression level.
            });

            archive.on('error', function(err) {
                throw err;
            });

            output.on('close', function() {
                fs.renameSync(pathZip, pathXmind);
                let readFile = fs.readFileSync(pathXmind);
                fs.writeFileSync(pathxmind, readFile);                                
                // 完毕 删除文件
                deleteXmlFile();
            });

            archive.pipe(output);
            archive.directory(pathFile, false);
            archive.finalize();

            return ;                        
        },

        // recognize: recognize,
        recognizePriority: -1
    };

} ());