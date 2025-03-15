// 汎用プラグインテンプレート
// このテンプレートを基に独自のプラグインを開発できます
// 必ず、(function() { と })(); の間にコードを記述してください
// alertやconfirmなどのダイアログは使用できません
// click可能な要素には clickable クラスを付与してください
/* 
利用可能なAPI (context.wailsBindings.xxx で呼び出し)
  WritePluginLog: (pluginId: string, level: string, message: string) => Promise<void>;
  ReadPluginLogs: (pluginId: string, maxLines: number) => Promise<string[]>;
  ClearPluginLogs: (pluginId: string) => Promise<void>;
  ReadClipboard: () => Promise<string>;
  WriteClipboard: (text: string) => Promise<void>;
  ReturnFocusToPreviousWindow: () => Promise<void>;
  TakeScreenshot: () => Promise<void>;
  GetPluginDirectories: () => Promise<string[]>;
  ListPluginEntries: (dir: string) => Promise<{name: string, isDirectory: boolean}[]>;
  ReadPluginManifest: (path: string) => Promise<any>;
  ReadPluginModule: (path: string, moduleName: string) => Promise<string>;
  GetIconData: (path: string) => Promise<Uint8Array>;
  OpenMemo: () => Promise<void>;
  SimulateKeyPress: (keyString: string) => Promise<void>;
  GetPressedKeys: () => Promise<string[]>;
  GetMousePosX: () => Promise<number>;
  GetMousePosY: () => Promise<number>;
*/


(function() {
  // モジュールスコープの変数
  let context = null;        // プラグインコンテキスト
  let logger = null;         // ロガー
  let wailsRuntime = null;   // wailsランタイム
  
  // UI関連の変数
  let mainViewElement = null;         // メインビュー要素
  let secondaryViewElement = null;    // セカンダリビュー要素
  let closePopupFunc = null;          // ポップアップを閉じる関数
  let contextMenuPopupFunc = null;    // コンテキストメニュー用
  let confirmDialogFunc = null;       // 確認ダイアログ用
  let promptDialogFunc = null;        // 入力ダイアログ用
  
  // プラグイン固有のデータ
  let pluginData = [];
  
  // ==========================================================
  // データ永続化関数
  // ==========================================================
  
  /**
   * データをファイルに保存
   */
  async function saveData() {
    try {
      if (context && context.wailsBindings && typeof context.wailsBindings.SaveDataToFile === 'function') {
        await context.wailsBindings.SaveDataToFile('plugin_data.json', JSON.stringify(pluginData));
        if (logger) {
          await logger.info('プラグインデータを保存しました');
        }
      } else {
        console.error('SaveDataToFileメソッドが見つかりません');
        // 代替としてローカルストレージを使用
        localStorage.setItem('plugin_data', JSON.stringify(pluginData));
      }
    } catch (error) {
      console.error('データの保存に失敗しました:', error);
    }
  }
  
  /**
   * ファイルからデータを読み込み
   */
  async function loadData() {
    try {
      let data = null;
      if (context && context.wailsBindings && typeof context.wailsBindings.LoadDataFromFile === 'function') {
        data = await context.wailsBindings.LoadDataFromFile('plugin_data.json');
        if (logger) {
          await logger.info('プラグインデータを読み込みました');
        }
      } else {
        console.warn('LoadDataFromFileメソッドが見つかりません');
        // 代替としてローカルストレージを使用
        data = localStorage.getItem('plugin_data');
      }
      
      if (data) {
        pluginData = JSON.parse(data);
      } else {
        // デフォルトデータの設定
        pluginData = [
          // ここにデフォルトデータを設定
          { id: 1, name: 'サンプルアイテム1' },
          { id: 2, name: 'サンプルアイテム2' }
        ];
      }
    } catch (error) {
      console.error('データの読み込みに失敗しました:', error);
      // エラー時はデフォルトデータを設定
      pluginData = [
        { id: 1, name: 'サンプルアイテム1' },
        { id: 2, name: 'サンプルアイテム2' }
      ];
    }
  }
  
  // ==========================================================
  // UI関連の関数
  // ==========================================================
  
  /**
   * ポップアップを表示する関数
   * @param {HTMLElement|string} content - 表示するコンテンツ
   * @param {number} x - X座標
   * @param {number} y - Y座標
   * @param {Object} options - オプション設定
   * @returns {Function} ポップアップを閉じる関数
   */
  function showPopup(content, x, y, options = {}) {
    console.log('showPopup が呼び出されました');
    
    // 既存のポップアップを閉じる（オプションで指定がある場合のみ）
    if (closePopupFunc && options.closeExisting !== false) {
      closePopupFunc();
      closePopupFunc = null;
    }
    
    // ポップアップコンテナ（ウィンドウスタイル）
    const popupContainer = document.createElement('div');
    popupContainer.style.position = 'fixed';
    popupContainer.style.backgroundColor = 'white';
    popupContainer.style.borderRadius = '8px';
    popupContainer.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.25)';
    popupContainer.style.padding = '0';
    popupContainer.style.width = '700px';
    popupContainer.style.minWidth = '700px';
    popupContainer.style.maxWidth = '90vw';
    popupContainer.style.maxHeight = '80vh';
    popupContainer.style.overflow = 'hidden';
    popupContainer.style.zIndex = '10000';
    popupContainer.className = 'plugin-popup clickable';
    
    // タイトルバー部分
    const titleBar = document.createElement('div');
    titleBar.style.backgroundColor = '#4299e1';
    titleBar.style.color = 'white';
    titleBar.style.padding = '8px 15px';
    titleBar.style.fontWeight = 'bold';
    titleBar.style.display = 'flex';
    titleBar.style.justifyContent = 'space-between';
    titleBar.style.alignItems = 'center';
    titleBar.style.cursor = 'move';
    titleBar.className = 'clickable';
    
    const titleText = document.createElement('span');
    titleText.textContent = options.title || 'プラグイン';
    
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '✕';
    closeButton.style.background = 'none';
    closeButton.style.border = 'none';
    closeButton.style.color = 'white';
    closeButton.style.fontSize = '16px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.padding = '0 5px';
    closeButton.className = 'clickable';
    
    titleBar.appendChild(titleText);
    titleBar.appendChild(closeButton);
    
    // コンテンツ部分
    const contentContainer = document.createElement('div');
    contentContainer.style.padding = '15px';
    contentContainer.style.maxHeight = 'calc(80vh - 40px)';
    contentContainer.style.overflow = 'auto';
    contentContainer.style.minWidth = '650px';
    
    // contentが要素の場合はそのまま追加、文字列の場合はinnerHTMLで設定
    if (typeof content === 'string') {
      contentContainer.innerHTML = content;
    } else if (content instanceof HTMLElement) {
      contentContainer.appendChild(content);
    }
    
    // 要素を組み立て
    popupContainer.appendChild(titleBar);
    popupContainer.appendChild(contentContainer);
    document.body.appendChild(popupContainer);
    
    // 位置の設定（マウス位置を基準）
    // 画面からはみ出さないように調整
    setTimeout(() => {
      const rect = popupContainer.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // x座標の調整（右端からはみ出す場合）
      let posX = x;
      if (x + rect.width > viewportWidth) {
        posX = viewportWidth - rect.width - 10;
      }
      
      // y座標の調整（下端からはみ出す場合）
      let posY = y;
      if (y + rect.height > viewportHeight) {
        posY = viewportHeight - rect.height - 10;
      }
      
      // 位置を設定
      popupContainer.style.left = `${posX}px`;
      popupContainer.style.top = `${posY}px`;
    }, 0);
    
    // ドラッグ機能の実装
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;
    
    titleBar.addEventListener('mousedown', (e) => {
      isDragging = true;
      const rect = popupContainer.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
    });
    
    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        popupContainer.style.left = `${e.clientX - offsetX}px`;
        popupContainer.style.top = `${e.clientY - offsetY}px`;
      }
    });
    
    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
    
    // 閉じる関数
    const close = () => {
      console.log('ポップアップを閉じています');
      if (document.body.contains(popupContainer)) {
        document.body.removeChild(popupContainer);
        if (options.onClose) {
          options.onClose();
        }
      }
      
      // コンテキストメニューも閉じる
      if (contextMenuPopupFunc) {
        contextMenuPopupFunc();
        contextMenuPopupFunc = null;
      }
      
      // 確認ダイアログも閉じる
      if (confirmDialogFunc) {
        confirmDialogFunc();
        confirmDialogFunc = null;
      }
      
      // 入力ダイアログも閉じる
      if (promptDialogFunc) {
        promptDialogFunc();
        promptDialogFunc = null;
      }
      
      // ドラッグ終了時の状態をクリア
      isDragging = false;
      
      // documentのマウスイベントリスナーを削除
      document.removeEventListener('mousemove', close);
      document.removeEventListener('mouseup', close);
    };
    
    // 閉じるボタンにイベントリスナーを設定
    closeButton.addEventListener('click', close);
    
    // ESCキーで閉じる
    if (options.closeOnEscape !== false) {
      const escHandler = (e) => {
        if (e.key === 'Escape') {
          console.log('ESCキーが押されました');
          close();
          document.removeEventListener('keydown', escHandler);
        }
      };
      document.addEventListener('keydown', escHandler);
    }
    
    return close;
  }
  
  /**
   * コンテキストメニューを表示
   * @param {number} x - X座標
   * @param {number} y - Y座標
   * @param {Array} menuItems - メニュー項目の配列
   */
  function showContextMenu(x, y, menuItems) {
    console.log(`コンテキストメニューを表示 - 位置:(${x},${y})`);
    
    // 既存のコンテキストメニューがあれば閉じる
    if (contextMenuPopupFunc) {
      contextMenuPopupFunc();
      contextMenuPopupFunc = null;
    }
    
    const menuContent = document.createElement('div');
    menuContent.className = 'context-menu clickable';
    menuContent.style.minWidth = '150px';
    menuContent.style.backgroundColor = 'white';
    menuContent.style.borderRadius = '8px';
    menuContent.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.25)';
    
    // メニュー項目を追加
    menuItems.forEach((item, index) => {
      const menuItem = document.createElement('div');
      menuItem.textContent = item.text;
      menuItem.className = 'context-menu-item clickable';
      menuItem.style.padding = '8px 12px';
      menuItem.style.cursor = 'pointer';
      
      // 最後の項目以外は下線を付ける
      if (index < menuItems.length - 1) {
        menuItem.style.borderBottom = '1px solid #eee';
      }
      
      // スタイルオプションを適用
      if (item.styles) {
        Object.keys(item.styles).forEach(key => {
          menuItem.style[key] = item.styles[key];
        });
      }
      
      // クリックイベントハンドラ
      menuItem.onclick = function() {
        console.log(`メニュー項目「${item.text}」がクリックされました`);
        closeContextMenu(); // コンテキストメニューを閉じる
        
        if (item.onClick) {
          item.onClick();
        }
      };
      
      menuContent.appendChild(menuItem);
    });
    
    // コンテキストメニューを表示するための要素を作成
    const contextMenuElement = document.createElement('div');
    contextMenuElement.className = 'context-menu-container clickable';
    contextMenuElement.style.position = 'fixed';
    contextMenuElement.style.left = `${x}px`;
    contextMenuElement.style.top = `${y}px`;
    contextMenuElement.style.zIndex = '20000'; // 通常のポップアップより上に表示
    contextMenuElement.appendChild(menuContent);
    
    document.body.appendChild(contextMenuElement);
    
    // 閉じる処理
    const closeContextMenu = () => {
      console.log('コンテキストメニューを閉じます');
      if (document.body.contains(contextMenuElement)) {
        document.body.removeChild(contextMenuElement);
      }
      document.removeEventListener('click', outsideClickHandler);
      document.removeEventListener('keydown', escKeyHandler);
      contextMenuPopupFunc = null;
    };
    
    // 外側クリックで閉じる
    const outsideClickHandler = (event) => {
      if (!contextMenuElement.contains(event.target)) {
        closeContextMenu();
      }
    };
    
    // ESCキーで閉じる
    const escKeyHandler = (event) => {
      if (event.key === 'Escape') {
        closeContextMenu();
      }
    };
    
    // イベントハンドラーの登録
    // 次のティックで登録することで、現在のクリックイベントが処理されるのを防ぐ
    setTimeout(() => {
      document.addEventListener('click', outsideClickHandler);
      document.addEventListener('keydown', escKeyHandler);
    }, 10);
    
    contextMenuPopupFunc = closeContextMenu;
  }
  
  /**
   * カスタム確認ダイアログを表示
   * @param {string} message - 表示するメッセージ
   * @param {Function} onConfirm - 確認時のコールバック
   * @param {Object} options - オプション設定
   */
  function showConfirmDialog(message, onConfirm, options = {}) {
    console.log('確認ダイアログを表示: ' + message);
    
    // 既存のダイアログを閉じる
    if (confirmDialogFunc) {
      confirmDialogFunc();
      confirmDialogFunc = null;
    }
    
    // ダイアログのコンテナ
    const dialogContainer = document.createElement('div');
    dialogContainer.className = 'confirm-dialog-overlay clickable';
    dialogContainer.style.position = 'fixed';
    dialogContainer.style.top = '0';
    dialogContainer.style.left = '0';
    dialogContainer.style.width = '100%';
    dialogContainer.style.height = '100%';
    dialogContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    dialogContainer.style.display = 'flex';
    dialogContainer.style.justifyContent = 'center';
    dialogContainer.style.alignItems = 'center';
    dialogContainer.style.zIndex = '30000'; // 他のポップアップより上に表示
    
    // ダイアログボックス
    const dialogBox = document.createElement('div');
    dialogBox.className = 'confirm-dialog-box clickable';
    dialogBox.style.backgroundColor = 'white';
    dialogBox.style.borderRadius = '8px';
    dialogBox.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
    dialogBox.style.padding = '20px';
    dialogBox.style.width = '400px';
    dialogBox.style.minWidth = '400px';
    dialogBox.style.maxWidth = '90%';
    
    // メッセージ
    const messageElement = document.createElement('p');
    messageElement.textContent = message;
    messageElement.style.marginBottom = '20px';
    messageElement.style.textAlign = 'center';
    
    // ボタンコンテナ
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'space-between';
    buttonContainer.className = 'clickable';
    
    // キャンセルボタン
    const cancelButton = document.createElement('button');
    cancelButton.textContent = options.cancelText || 'キャンセル';
    cancelButton.className = 'dialog-button clickable';
    cancelButton.style.padding = '8px 16px';
    cancelButton.style.backgroundColor = '#e2e8f0';
    cancelButton.style.color = '#333';
    cancelButton.style.border = 'none';
    cancelButton.style.borderRadius = '4px';
    cancelButton.style.cursor = 'pointer';
    cancelButton.style.marginRight = '10px';
    
    // 確認ボタン
    const confirmButton = document.createElement('button');
    confirmButton.textContent = options.confirmText || '確認';
    confirmButton.className = 'dialog-button clickable';
    confirmButton.style.padding = '8px 16px';
    confirmButton.style.backgroundColor = options.confirmColor || '#4299e1';
    confirmButton.style.color = 'white';
    confirmButton.style.border = 'none';
    confirmButton.style.borderRadius = '4px';
    confirmButton.style.cursor = 'pointer';
    
    // ダイアログを閉じる
    const closeDialog = () => {
      console.log('確認ダイアログを閉じます');
      if (document.body.contains(dialogContainer)) {
        document.body.removeChild(dialogContainer);
      }
      confirmDialogFunc = null;
    };
    
    // キャンセルボタンのイベント
    cancelButton.onclick = function() {
      console.log('確認ダイアログ: キャンセルをクリック');
      closeDialog();
      if (options.onCancel) {
        options.onCancel();
      }
    };
    
    // 確認ボタンのイベント
    confirmButton.onclick = function() {
      console.log('確認ダイアログ: 確認をクリック');
      closeDialog();
      if (onConfirm) {
        onConfirm();
      }
    };
    
    // ESCキーで閉じる
    const escKeyHandler = (event) => {
      if (event.key === 'Escape') {
        closeDialog();
        document.removeEventListener('keydown', escKeyHandler);
      }
    };
    document.addEventListener('keydown', escKeyHandler);
    
    // 要素を組み立て
    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(confirmButton);
    dialogBox.appendChild(messageElement);
    dialogBox.appendChild(buttonContainer);
    dialogContainer.appendChild(dialogBox);
    document.body.appendChild(dialogContainer);
    
    confirmDialogFunc = closeDialog;
    return closeDialog;
  }
  
  /**
   * カスタム入力ダイアログを表示
   * @param {string} title - ダイアログのタイトル
   * @param {string} defaultValue - デフォルト値
   * @param {Function} onConfirm - 確認時のコールバック
   * @param {Object} options - オプション設定
   */
  function showPromptDialog(title, defaultValue, onConfirm, options = {}) {
    console.log('入力ダイアログを表示: ' + title);
    
    // 既存の入力ダイアログがあれば閉じる
    if (promptDialogFunc) {
      promptDialogFunc();
      promptDialogFunc = null;
    }
    
    // ダイアログのコンテナ
    const dialogContainer = document.createElement('div');
    dialogContainer.className = 'prompt-dialog-overlay clickable';
    dialogContainer.style.position = 'fixed';
    dialogContainer.style.top = '0';
    dialogContainer.style.left = '0';
    dialogContainer.style.width = '100%';
    dialogContainer.style.height = '100%';
    dialogContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    dialogContainer.style.display = 'flex';
    dialogContainer.style.justifyContent = 'center';
    dialogContainer.style.alignItems = 'center';
    dialogContainer.style.zIndex = '30000'; // 他のポップアップより上に表示
    
    // ダイアログボックス
    const dialogBox = document.createElement('div');
    dialogBox.className = 'prompt-dialog-box clickable';
    dialogBox.style.backgroundColor = 'white';
    dialogBox.style.borderRadius = '8px';
    dialogBox.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
    dialogBox.style.padding = '20px';
    dialogBox.style.width = '450px';
    dialogBox.style.minWidth = '450px';
    dialogBox.style.maxWidth = '90%';
    
    // タイトル
    const titleElement = document.createElement('h3');
    titleElement.textContent = title;
    titleElement.style.marginBottom = '15px';
    titleElement.style.textAlign = 'center';
    
    // 入力フィールド
    const inputElement = document.createElement('input');
    inputElement.type = 'text';
    inputElement.value = defaultValue || '';
    inputElement.className = 'prompt-input clickable';
    inputElement.style.width = '100%';
    inputElement.style.padding = '8px';
    inputElement.style.marginBottom = '20px';
    inputElement.style.borderRadius = '4px';
    inputElement.style.border = '1px solid #ccc';
    
    // ボタンコンテナ
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'space-between';
    buttonContainer.className = 'clickable';
    
    // キャンセルボタン
    const cancelButton = document.createElement('button');
    cancelButton.textContent = options.cancelText || 'キャンセル';
    cancelButton.className = 'dialog-button clickable';
    cancelButton.style.padding = '8px 16px';
    cancelButton.style.backgroundColor = '#e2e8f0';
    cancelButton.style.color = '#333';
    cancelButton.style.border = 'none';
    cancelButton.style.borderRadius = '4px';
    cancelButton.style.cursor = 'pointer';
    cancelButton.style.marginRight = '10px';
    
    // 確認ボタン
    const confirmButton = document.createElement('button');
    confirmButton.textContent = options.confirmText || '保存';
    confirmButton.className = 'dialog-button clickable';
    confirmButton.style.padding = '8px 16px';
    confirmButton.style.backgroundColor = options.confirmColor || '#4299e1';
    confirmButton.style.color = 'white';
    confirmButton.style.border = 'none';
    confirmButton.style.borderRadius = '4px';
    confirmButton.style.cursor = 'pointer';
    
    // ダイアログを閉じる
    const closeDialog = () => {
      console.log('入力ダイアログを閉じます');
      if (document.body.contains(dialogContainer)) {
        document.body.removeChild(dialogContainer);
      }
      promptDialogFunc = null;
    };
    
    // フォームの送信をハンドル
    const handleSubmit = () => {
      const value = inputElement.value.trim();
      if (value || options.allowEmpty) {
        closeDialog();
        if (onConfirm) {
          onConfirm(value);
        }
      }
    };
    
    // キャンセルボタンのイベント
    cancelButton.onclick = function() {
      console.log('入力ダイアログ: キャンセルをクリック');
      closeDialog();
      if (options.onCancel) {
        options.onCancel();
      }
    };
    
    // 確認ボタンのイベント
    confirmButton.onclick = function() {
      console.log('入力ダイアログ: 保存をクリック');
      handleSubmit();
    };
    
    // Enter キーで送信
    inputElement.onkeydown = function(e) {
      if (e.key === 'Enter') {
        handleSubmit();
      }
    };
    
    // ESCキーで閉じる
    const escKeyHandler = (event) => {
      if (event.key === 'Escape') {
        closeDialog();
        document.removeEventListener('keydown', escKeyHandler);
      }
    };
    document.addEventListener('keydown', escKeyHandler);
    
    // ダイアログが表示されたら入力フィールドにフォーカス
    setTimeout(() => {
      inputElement.focus();
      inputElement.select();
    }, 50);
    
    // 要素を組み立て
    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(confirmButton);
    dialogBox.appendChild(titleElement);
    dialogBox.appendChild(inputElement);
    dialogBox.appendChild(buttonContainer);
    dialogContainer.appendChild(dialogBox);
    document.body.appendChild(dialogContainer);
    
    promptDialogFunc = closeDialog;
    return closeDialog;
  }
  
  // ==========================================================
  // ユーティリティ関数
  // ==========================================================
  
  /**
   * マウス位置の取得
   * @returns {Promise<Object>} マウス位置を含むオブジェクト
   */
  async function getMousePosition() {
    let x = 100;
    let y = 100;
    
    try {
      if (context && context.wailsBindings) {
        // Wails APIを使用してマウス位置を取得
        if (typeof context.wailsBindings.GetMousePosX === 'function') {
          x = await context.wailsBindings.GetMousePosX();
        }
        
        if (typeof context.wailsBindings.GetMousePosY === 'function') {
          y = await context.wailsBindings.GetMousePosY();
        }
      }
    } catch (e) {
      console.error('マウス位置の取得に失敗しました:', e);
    }
    
    return { x, y };
  }
  
  /**
   * メインビューを作成する関数
   * このメソッドは実際のプラグインに合わせてカスタマイズしてください
   * @returns {HTMLElement} メインビュー要素
   */
  function createMainView() {
    const container = document.createElement('div');
    container.className = 'plugin-main-view';
    container.style.width = '100%';
    container.style.minHeight = '200px';
    
    // タイトルなどの要素を追加
    const title = document.createElement('h2');
    title.textContent = 'プラグインメインビュー';
    title.style.marginBottom = '15px';
    
    // リストまたはコンテンツ領域
    const contentArea = document.createElement('div');
    contentArea.className = 'plugin-content-area';
    contentArea.style.backgroundColor = '#f8f9fa';
    contentArea.style.borderRadius = '5px';
    contentArea.style.padding = '15px';
    contentArea.style.minHeight = '150px';
    
    // サンプルデータを表示
    contentArea.innerHTML = '<p>ここにプラグインの主要なコンテンツやリストを表示します。</p>';
    
    // アクションボタン
    const actionButton = document.createElement('button');
    actionButton.textContent = 'アクション実行';
    actionButton.className = 'clickable';
    actionButton.style.padding = '8px 16px';
    actionButton.style.backgroundColor = '#4299e1';
    actionButton.style.color = 'white';
    actionButton.style.border = 'none';
    actionButton.style.borderRadius = '4px';
    actionButton.style.marginTop = '15px';
    actionButton.style.cursor = 'pointer';
    
    actionButton.onclick = function() {
      console.log('アクションボタンがクリックされました');
      // ここにアクション実行コードを記述
    };
    
    // 要素を組み立て
    container.appendChild(title);
    container.appendChild(contentArea);
    container.appendChild(actionButton);
    
    return container;
  }
  
  /**
   * メインビューを表示
   */
  function showMainView() {
    mainViewElement = createMainView();
    
    // マウス位置を取得し、ポップアップを表示
    getMousePosition().then(({ x, y }) => {
      closePopupFunc = showPopup(mainViewElement, x, y, {
        title: 'プラグイン',
        closeOnEscape: true,
        onClose: () => {
          mainViewElement = null;
          closePopupFunc = null;
        }
      });
    });
  }
  
  // ==========================================================
  // モジュールのエクスポート
  // ==========================================================
  module.exports = {
    // コンテキストの初期化
    init: async function(pluginContext) {
      context = pluginContext;
      logger = context?.logger;
      wailsRuntime = context?.wailsRuntime;
      
      console.log('プラグインが初期化されました');
      if (logger) {
        await logger.info('プラグインが初期化されました');
      }
      
      // データの読み込み
      await loadData();
    },
    
    // ゴーストがアクティブになったときの処理
    onActivate: async function() {
      console.log('プラグインがアクティブになりました');
      if (logger) {
        await logger.info('プラグインがアクティブになりました');
      }
    },
    
    // ゴーストが非アクティブになったときの処理
    onDeactivate: async function() {
      console.log('プラグインが非アクティブになりました');
      if (logger) {
        await logger.info('プラグインが非アクティブになりました');
      }
      
      // ポップアップが表示されている場合は閉じる
      if (closePopupFunc) {
        closePopupFunc();
        closePopupFunc = null;
      }
    },
    
    // ゴーストが左クリックされたときの処理
    onClick: async function() {
      console.log('onClick イベントが発生しました');
      if (logger) {
        await logger.info('プラグインがクリックされました');
      }
      
      // 既にポップアップが開いている場合は閉じる
      if (closePopupFunc) {
        closePopupFunc();
        closePopupFunc = null;
        return;
      }
      
      // メインビューを表示
      showMainView();
    },
    
    // ゴーストが右クリックされたときの処理
    onRightClick: async function() {
      console.log('onRightClick イベントが発生しました');
      if (logger) {
        await logger.info('プラグインが右クリックされました');
      }
      
      // 既にポップアップが開いている場合は閉じる
      if (closePopupFunc) {
        closePopupFunc();
        closePopupFunc = null;
        return;
      }
      
      // メインビューを表示（または代替の処理）
      showMainView();
      
      // 右クリック時に特別な処理が必要な場合はここにコードを追加
    },

    // ショートカット1が押されたときの処理
    onPushSC1: async function() {},

    // ショートカット2が押されたときの処理
    onPushSC2: async function() {},

    // ショートカット3が押されたときの処理
    onPushSC3: async function() {},

    // 特殊ショートカットが押されたときの処理
    onPushSub: async function() {},
    
    // ボタンのテキストを設定
    getButtonText: function() {
      return 'プラグイン';
    },
    
    // 初期化処理
    onInit: async function() {
      try {
        console.log('onInit が呼び出されました');
        if (logger) {
          await logger.info('プラグインを初期化しています...');
        }
        
        // データの読み込み
        await loadData();
        
        return true;
      } catch (error) {
        console.error('プラグインの初期化中にエラーが発生しました:', error);
        if (logger) {
          await logger.error('プラグインの初期化中にエラーが発生しました: ' + error.message);
        }
        return false;
      }
    },
    
    // クリーンアップ処理
    onCleanup: async function() {
      try {
        console.log('onCleanup が呼び出されました');
        if (logger) {
          await logger.info('プラグインをクリーンアップしています...');
        }
        
        // ポップアップが表示されている場合は閉じる
        if (closePopupFunc) {
          closePopupFunc();
          closePopupFunc = null;
        }
        
        // コンテキストメニューが表示されている場合は閉じる
        if (contextMenuPopupFunc) {
          contextMenuPopupFunc();
          contextMenuPopupFunc = null;
        }
        
        // 確認ダイアログが表示されている場合は閉じる
        if (confirmDialogFunc) {
          confirmDialogFunc();
          confirmDialogFunc = null;
        }
        
        // 入力ダイアログが表示されている場合は閉じる
        if (promptDialogFunc) {
          promptDialogFunc();
          promptDialogFunc = null;
        }
        
        return true;
      } catch (error) {
        console.error('プラグインのクリーンアップ中にエラーが発生しました:', error);
        if (logger) {
          await logger.error('プラグインのクリーンアップ中にエラーが発生しました: ' + error.message);
        }
        return false;
      }
    }
  };
})();
