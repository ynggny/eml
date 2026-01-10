/**
 * サンプルEMLデータ
 * ツールの機能を体感するための様々な危険パターンを含むサンプル
 */

export interface SampleEml {
  id: string;
  name: string;
  description: string;
  category: 'safe' | 'auth' | 'phishing' | 'bec' | 'attachment' | 'combo';
  dangerLevel: 1 | 2 | 3 | 4 | 5; // 1=安全, 5=超危険
  features: string[]; // 体感できる機能
  content: string;
}

// ヘルパー: 日付生成（過去数日以内のランダムな日付）
function randomDate(): string {
  const now = new Date();
  const daysAgo = Math.floor(Math.random() * 7);
  const hoursAgo = Math.floor(Math.random() * 24);
  now.setDate(now.getDate() - daysAgo);
  now.setHours(now.getHours() - hoursAgo);
  return now.toUTCString();
}

// ヘルパー: Message-ID生成
function randomMessageId(domain: string): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 32; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `<${id}@${domain}>`;
}

/**
 * サンプルEML生成関数
 */
export const sampleEmls: SampleEml[] = [
  // ========================================
  // 1. 正常なメール（安全）
  // ========================================
  {
    id: 'safe-normal',
    name: '正常なメール',
    description: 'すべての認証がPass。安全なメールの見本',
    category: 'safe',
    dangerLevel: 1,
    features: ['認証結果表示', 'ハッシュ計算', 'セキュリティスコア'],
    content: `From: info@example.com
To: user@example.org
Subject: 月次レポートのお知らせ
Date: ${randomDate()}
Message-ID: ${randomMessageId('example.com')}
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
Authentication-Results: mx.example.org;
 spf=pass smtp.mailfrom=example.com;
 dkim=pass header.d=example.com header.s=selector1;
 dmarc=pass header.from=example.com
Received: from mail.example.com (mail.example.com [192.0.2.1])
 by mx.example.org (Postfix) with ESMTPS id ABC123
 for <user@example.org>; ${randomDate()}
Received: from internal.example.com (internal.example.com [10.0.0.1])
 by mail.example.com (Postfix) with ESMTPS id DEF456;
 ${randomDate()}

お疲れ様です。

月次レポートが完成しましたのでお知らせします。
詳細は社内ポータルをご確認ください。

よろしくお願いいたします。
`,
  },

  // ========================================
  // 2. SPF失敗メール
  // ========================================
  {
    id: 'auth-spf-fail',
    name: 'SPF認証失敗',
    description: 'SPFがfail。送信元IPが許可リストにない',
    category: 'auth',
    dangerLevel: 2,
    features: ['SPF認証エラー', '認証結果の可視化'],
    content: `From: admin@legitimate-company.com
To: victim@example.org
Subject: 【重要】パスワード変更のお願い
Date: ${randomDate()}
Message-ID: ${randomMessageId('suspicious-server.net')}
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
Authentication-Results: mx.example.org;
 spf=fail smtp.mailfrom=legitimate-company.com (sender IP is 203.0.113.99);
 dkim=none;
 dmarc=fail header.from=legitimate-company.com
Received: from suspicious-server.net (suspicious-server.net [203.0.113.99])
 by mx.example.org (Postfix) with ESMTP id SPF001
 for <victim@example.org>; ${randomDate()}

お客様各位

セキュリティ強化のため、パスワードの変更をお願いいたします。

以下のリンクからお手続きください：
https://legitimate-company.com.evil.net/password-reset

株式会社レジティメイト
`,
  },

  // ========================================
  // 3. DKIM失敗メール
  // ========================================
  {
    id: 'auth-dkim-fail',
    name: 'DKIM署名改ざん',
    description: 'DKIM署名が無効。メール内容が改ざんされた可能性',
    category: 'auth',
    dangerLevel: 3,
    features: ['DKIM検証エラー', '改ざん検知'],
    content: `From: ceo@bigcorp.co.jp
To: finance@bigcorp.co.jp
Subject: 【至急】振込依頼
Date: ${randomDate()}
Message-ID: ${randomMessageId('bigcorp.co.jp')}
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
DKIM-Signature: v=1; a=rsa-sha256; d=bigcorp.co.jp; s=selector1;
 h=from:to:subject:date; bh=invalidhash==; b=tampered_signature==
Authentication-Results: mx.bigcorp.co.jp;
 spf=pass smtp.mailfrom=bigcorp.co.jp;
 dkim=fail (signature verification failed) header.d=bigcorp.co.jp;
 dmarc=fail header.from=bigcorp.co.jp
Received: from mail.bigcorp.co.jp (mail.bigcorp.co.jp [192.0.2.10])
 by mx.bigcorp.co.jp (Postfix) with ESMTPS id DKIM001;
 ${randomDate()}

経理部長 様

至急、以下の口座に500万円を振り込んでください。
通常とは異なる口座ですが、緊急の案件です。

銀行名：フェイク銀行
口座番号：1234567
名義：カブシキガイシャアクマ

本メールへの返信は不要です。
電話での確認もご遠慮ください。

代表取締役社長
`,
  },

  // ========================================
  // 4. DMARC失敗メール
  // ========================================
  {
    id: 'auth-dmarc-fail',
    name: 'DMARC認証失敗',
    description: 'DMARCポリシー違反。ドメイン偽装の可能性大',
    category: 'auth',
    dangerLevel: 3,
    features: ['DMARC検証', 'ドメイン偽装検知'],
    content: `From: support@amazon.co.jp
To: customer@example.com
Subject: [Amazon] アカウント情報の確認
Date: ${randomDate()}
Message-ID: ${randomMessageId('fake-amazon.tk')}
MIME-Version: 1.0
Content-Type: text/html; charset=UTF-8
Authentication-Results: mx.example.com;
 spf=fail smtp.mailfrom=fake-amazon.tk;
 dkim=none;
 dmarc=fail (p=reject) header.from=amazon.co.jp
Received: from fake-amazon.tk (fake-amazon.tk [198.51.100.99])
 by mx.example.com (Postfix) with ESMTP id DMARC01;
 ${randomDate()}

<html>
<body style="font-family: Arial, sans-serif;">
<div style="max-width: 600px; margin: 0 auto; padding: 20px;">
<img src="https://fake-amazon.tk/logo.png" alt="Amazon" style="width: 150px;">
<h2>アカウント情報の確認が必要です</h2>
<p>お客様のアカウントに不審なログインがありました。</p>
<p>24時間以内に以下のリンクから確認してください。</p>
<a href="http://192.168.1.100:8080/amazon-verify" style="background: #ff9900; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">今すぐ確認する</a>
<p style="font-size: 12px; color: #666;">このメールに心当たりがない場合は無視してください。</p>
</div>
</body>
</html>
`,
  },

  // ========================================
  // 5. ホモグラフ攻撃（キリル文字）
  // ========================================
  {
    id: 'phishing-homograph',
    name: 'ホモグラフ攻撃',
    description: 'キリル文字を使った偽装ドメイン（аpple.com ≠ apple.com）',
    category: 'phishing',
    dangerLevel: 4,
    features: ['ホモグラフ検出', 'Lookalikeドメイン検知', 'Unicode分析'],
    content: `From: support@аpple.com
To: user@example.com
Subject: Apple ID サインインが検出されました
Date: ${randomDate()}
Message-ID: ${randomMessageId('xn--pple-43d.com')}
MIME-Version: 1.0
Content-Type: text/html; charset=UTF-8
Authentication-Results: mx.example.com;
 spf=pass smtp.mailfrom=xn--pple-43d.com;
 dkim=pass header.d=xn--pple-43d.com;
 dmarc=pass header.from=xn--pple-43d.com
Received: from mail.xn--pple-43d.com (mail.xn--pple-43d.com [198.51.100.50])
 by mx.example.com (Postfix) with ESMTPS id HOMO001;
 ${randomDate()}

<html>
<body style="font-family: -apple-system, sans-serif; background: #f5f5f7;">
<div style="max-width: 600px; margin: 0 auto; padding: 40px; background: white;">
<h1 style="font-size: 24px; font-weight: 300;">Apple ID</h1>
<p>お客様のApple IDを使用して、新しいデバイスからサインインしようとしています。</p>
<p><strong>デバイス:</strong> Windows PC</p>
<p><strong>場所:</strong> ウクライナ、キエフ</p>
<p>これがお客様ご自身でない場合は、今すぐパスワードを変更してください：</p>
<a href="https://аpple.com/security" style="display: inline-block; background: #007aff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">Apple IDを保護する</a>
<p style="font-size: 12px; color: #86868b; margin-top: 20px;">
※ 注意：このメールのドメイン「аpple.com」の「а」はキリル文字です
</p>
</div>
</body>
</html>
`,
  },

  // ========================================
  // 6. Lookalikeドメイン（タイポスクワッティング）
  // ========================================
  {
    id: 'phishing-lookalike',
    name: 'タイポスクワッティング',
    description: 'amazom.co.jp（mとn）のような類似ドメイン',
    category: 'phishing',
    dangerLevel: 3,
    features: ['Lookalikeドメイン検知', 'レーベンシュタイン距離'],
    content: `From: order@arnazon.co.jp
To: customer@example.com
Subject: ご注文の確認 [注文番号: 503-1234567-8901234]
Date: ${randomDate()}
Message-ID: ${randomMessageId('arnazon.co.jp')}
MIME-Version: 1.0
Content-Type: text/html; charset=UTF-8
Authentication-Results: mx.example.com;
 spf=pass smtp.mailfrom=arnazon.co.jp;
 dkim=pass header.d=arnazon.co.jp;
 dmarc=pass header.from=arnazon.co.jp
Received: from mail.arnazon.co.jp (mail.arnazon.co.jp [203.0.113.100])
 by mx.example.com (Postfix) with ESMTPS id TYPO001;
 ${randomDate()}

<html>
<body style="font-family: Arial, sans-serif;">
<div style="background: #232f3e; padding: 10px 20px;">
<span style="color: #ff9900; font-size: 24px; font-weight: bold;">arnazon</span>
</div>
<div style="padding: 20px;">
<h2>ご注文ありがとうございます</h2>
<p>以下のご注文を受け付けました。</p>
<table style="width: 100%; border-collapse: collapse;">
<tr style="background: #f0f0f0;">
<td style="padding: 10px; border: 1px solid #ddd;">商品名</td>
<td style="padding: 10px; border: 1px solid #ddd;">PlayStation 5 本体</td>
</tr>
<tr>
<td style="padding: 10px; border: 1px solid #ddd;">価格</td>
<td style="padding: 10px; border: 1px solid #ddd;">¥54,978</td>
</tr>
</table>
<p style="color: red;">この注文に覚えがない場合は、今すぐキャンセルしてください：</p>
<a href="http://arnazon.co.jp.phishing.site/cancel" style="background: #ff9900; color: white; padding: 10px 20px; text-decoration: none;">注文をキャンセル</a>
</div>
</body>
</html>
`,
  },

  // ========================================
  // 7. BEC詐欺（CEO詐欺）
  // ========================================
  {
    id: 'bec-ceo-fraud',
    name: 'CEO詐欺（BEC）',
    description: '社長を装った緊急送金要求。典型的なBEC手法',
    category: 'bec',
    dangerLevel: 4,
    features: ['BECパターン検出', '緊急性検知', '送金要求検知'],
    content: `From: "田中 太郎 社長" <tanaka.taro.ceo@gmail.com>
To: keiri@company.co.jp
Subject: 【極秘・至急】送金依頼
Date: ${randomDate()}
Message-ID: ${randomMessageId('gmail.com')}
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
Authentication-Results: mx.company.co.jp;
 spf=pass smtp.mailfrom=gmail.com;
 dkim=pass header.d=gmail.com;
 dmarc=pass header.from=gmail.com
Received: from mail-wr1-f41.google.com (mail-wr1-f41.google.com [209.85.221.41])
 by mx.company.co.jp (Postfix) with ESMTPS id BEC001;
 ${randomDate()}

経理部長 様

今、重要な商談の最中で電話に出られません。

至急お願いしたいことがあります。
取引先への支払いで、本日中に以下の口座へ
800万円を振り込む必要があります。

【振込先】
銀行名：みずほ銀行 渋谷支店
口座番号：普通 1234567
口座名義：カ）シンセツナトモダチ

この件は極秘でお願いします。
他の誰にも言わないでください。
確認の電話も不要です。メールで完結させてください。

振込が完了したら、このメールに返信してください。

田中 太郎
代表取締役社長
`,
  },

  // ========================================
  // 8. ギフトカード詐欺
  // ========================================
  {
    id: 'bec-giftcard',
    name: 'ギフトカード詐欺',
    description: 'ギフトカード購入を依頼する詐欺メール',
    category: 'bec',
    dangerLevel: 4,
    features: ['ギフトカード検知', 'BECパターン', '緊急性検知'],
    content: `From: "Director Yamamoto" <yamamoto.director@outlook.com>
To: assistant@company.co.jp
Subject: Quick favor needed
Date: ${randomDate()}
Message-ID: ${randomMessageId('outlook.com')}
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
Authentication-Results: mx.company.co.jp;
 spf=pass smtp.mailfrom=outlook.com;
 dkim=pass header.d=outlook.com;
 dmarc=pass header.from=outlook.com
Received: from mail-oln040092254051.outbound.protection.outlook.com
 by mx.company.co.jp with ESMTPS id GIFT001;
 ${randomDate()}

Hi,

Are you available? I need you to do something for me right away.
I'm in a meeting and can't make calls.

I need you to purchase some Google Play gift cards for our clients.
Buy 5 cards at $200 each ($1000 total).

Once you have them, scratch off the back and send me photos of the codes.
I'll reimburse you later.

This is urgent and confidential.
Don't tell anyone about this.

Thanks,
Yamamoto
Director

Sent from my iPhone
`,
  },

  // ========================================
  // 9. 危険な添付ファイル（二重拡張子）
  // ========================================
  {
    id: 'attachment-double-ext',
    name: '二重拡張子の罠',
    description: 'invoice.pdf.exe のような隠された実行ファイル',
    category: 'attachment',
    dangerLevel: 5,
    features: ['添付ファイル分析', '二重拡張子検知', '危険ファイル警告'],
    content: `From: invoice@supplier.com
To: accounting@example.com
Subject: Invoice #INV-2024-0892
Date: ${randomDate()}
Message-ID: ${randomMessageId('supplier.com')}
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="----=_Part_123456"
Authentication-Results: mx.example.com;
 spf=pass smtp.mailfrom=supplier.com;
 dkim=pass header.d=supplier.com;
 dmarc=pass header.from=supplier.com
Received: from mail.supplier.com (mail.supplier.com [192.0.2.50])
 by mx.example.com (Postfix) with ESMTPS id ATTACH01;
 ${randomDate()}

------=_Part_123456
Content-Type: text/plain; charset=UTF-8

Dear Accounting Team,

Please find attached the invoice for last month's services.
Payment is due within 30 days.

Best regards,
Supplier Corp.

------=_Part_123456
Content-Type: application/x-msdownload; name="Invoice_December_2024.pdf.exe"
Content-Disposition: attachment; filename="Invoice_December_2024.pdf.exe"
Content-Transfer-Encoding: base64

TVqQAAMAAAAEAAAA//8AALgAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
AAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=

------=_Part_123456--
`,
  },

  // ========================================
  // 10. マクロ付きOfficeファイル
  // ========================================
  {
    id: 'attachment-macro',
    name: 'マクロ有効Officeファイル',
    description: '.xlsm（マクロ付きExcel）添付。マルウェア配布の常套手段',
    category: 'attachment',
    dangerLevel: 4,
    features: ['マクロファイル検知', '添付ファイルリスク分析'],
    content: `From: hr@partner-company.com
To: employees@example.com
Subject: 【人事部】勤怠管理表の更新
Date: ${randomDate()}
Message-ID: ${randomMessageId('partner-company.com')}
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="----=_NextPart_000"
Authentication-Results: mx.example.com;
 spf=pass smtp.mailfrom=partner-company.com;
 dkim=pass header.d=partner-company.com;
 dmarc=pass header.from=partner-company.com
Received: from mail.partner-company.com (mail.partner-company.com [192.0.2.60])
 by mx.example.com (Postfix) with ESMTPS id MACRO001;
 ${randomDate()}

------=_NextPart_000
Content-Type: text/plain; charset=UTF-8

各位

勤怠管理表を更新しました。
添付ファイルを開いて、マクロを有効にしてください。

※ マクロを有効にしないと正しく表示されません

人事部

------=_NextPart_000
Content-Type: application/vnd.ms-excel.sheet.macroEnabled.12; name="勤怠管理表_2024年12月.xlsm"
Content-Disposition: attachment; filename="勤怠管理表_2024年12月.xlsm"
Content-Transfer-Encoding: base64

UEsDBBQAAAAIAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==

------=_NextPart_000--
`,
  },

  // ========================================
  // 11. 暗号化されていない経路
  // ========================================
  {
    id: 'tls-unencrypted',
    name: '暗号化なし経路',
    description: 'TLSを使用していないホップが存在。盗聴リスク',
    category: 'auth',
    dangerLevel: 2,
    features: ['TLS経路分析', 'Receivedヘッダー解析', '暗号化チェック'],
    content: `From: newsletter@marketing.example.com
To: subscriber@example.org
Subject: 今週のニュースレター
Date: ${randomDate()}
Message-ID: ${randomMessageId('marketing.example.com')}
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
Authentication-Results: mx.example.org;
 spf=pass smtp.mailfrom=marketing.example.com;
 dkim=pass header.d=marketing.example.com;
 dmarc=pass header.from=marketing.example.com
Received: from relay3.isp.net (relay3.isp.net [10.0.0.3])
 by mx.example.org (Postfix) with ESMTPS id TLS003;
 ${randomDate()}
Received: from relay2.isp.net (relay2.isp.net [10.0.0.2])
 by relay3.isp.net (Postfix) with ESMTP id TLS002;
 ${randomDate()}
Received: from relay1.isp.net (relay1.isp.net [10.0.0.1])
 by relay2.isp.net (Postfix) with SMTP id NOTLS01;
 ${randomDate()}
Received: from mail.marketing.example.com (mail.marketing.example.com [192.0.2.100])
 by relay1.isp.net (Postfix) with ESMTP id NOTLS00;
 ${randomDate()}

こんにちは！

今週の注目トピックをお届けします。

1. 新製品発表のお知らせ
2. セミナー開催情報
3. お得なキャンペーン

※ このメールは一部の経路で暗号化されていません
`,
  },

  // ========================================
  // 12. 短縮URL＆怪しいリンク
  // ========================================
  {
    id: 'phishing-shorturl',
    name: '短縮URL・不審リンク',
    description: 'bit.lyやIPアドレス直接指定など危険なリンク集',
    category: 'phishing',
    dangerLevel: 3,
    features: ['リンク安全性分析', '短縮URL検知', 'IP直接指定検知'],
    content: `From: promo@deals-newsletter.xyz
To: user@example.com
Subject: 【当選おめでとうございます】豪華賞品プレゼント
Date: ${randomDate()}
Message-ID: ${randomMessageId('deals-newsletter.xyz')}
MIME-Version: 1.0
Content-Type: text/html; charset=UTF-8
Authentication-Results: mx.example.com;
 spf=pass smtp.mailfrom=deals-newsletter.xyz;
 dkim=none;
 dmarc=none
Received: from mail.deals-newsletter.xyz (mail.deals-newsletter.xyz [203.0.113.200])
 by mx.example.com (Postfix) with ESMTP id SHORT01;
 ${randomDate()}

<html>
<body style="font-family: Arial; background: linear-gradient(45deg, #ff6b6b, #feca57); padding: 40px;">
<div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
<h1 style="color: #ff6b6b; text-align: center;">🎉 おめでとうございます！ 🎉</h1>
<p style="font-size: 18px; text-align: center;">あなたは<strong>iPhone 15 Pro Max</strong>の当選者に選ばれました！</p>

<h3>賞品を受け取るには以下のリンクをクリック：</h3>
<ul style="list-style: none; padding: 0;">
<li style="margin: 10px 0;">
<a href="https://bit.ly/3xYz123" style="color: blue;">👉 賞品を受け取る（短縮URL）</a>
</li>
<li style="margin: 10px 0;">
<a href="http://192.168.1.100:8080/claim">👉 こちらからも可能（IPアドレス）</a>
</li>
<li style="margin: 10px 0;">
<a href="https://google.com.claim-prize.tk/winner">👉 Google認証で受け取り</a>
</li>
<li style="margin: 10px 0;">
<a href="https://www.google.com">https://www.amazon.co.jp</a> （表示と実際のURLが異なる）
</li>
</ul>

<p style="font-size: 12px; color: #666; text-align: center; margin-top: 30px;">
※ 24時間以内に手続きを完了してください<br>
※ 手数料として3,000円が必要です
</p>
</div>
</body>
</html>
`,
  },

  // ========================================
  // 13. ARC転送メール
  // ========================================
  {
    id: 'arc-forwarded',
    name: 'ARC転送チェーン',
    description: 'メーリングリスト経由で転送されたメール（ARCヘッダー付き）',
    category: 'safe',
    dangerLevel: 1,
    features: ['ARC検証', 'メーリングリスト検知', '転送チェーン表示'],
    content: `From: original-sender@sender.example
To: mailing-list@lists.example.org
Subject: [ML] 技術共有：新しいフレームワークについて
Date: ${randomDate()}
Message-ID: ${randomMessageId('sender.example')}
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
ARC-Seal: i=1; a=rsa-sha256; d=lists.example.org; s=arc; cv=none;
 b=ABC123...
ARC-Message-Signature: i=1; a=rsa-sha256; d=lists.example.org; s=arc;
 h=from:to:subject:date; bh=xyz789==; b=DEF456...
ARC-Authentication-Results: i=1; lists.example.org;
 spf=pass smtp.mailfrom=sender.example;
 dkim=pass header.d=sender.example;
 dmarc=pass header.from=sender.example
Authentication-Results: mx.recipient.example;
 arc=pass (i=1) header.d=lists.example.org;
 spf=fail smtp.mailfrom=sender.example;
 dkim=fail header.d=sender.example;
 dmarc=fail header.from=sender.example
Received: from lists.example.org (lists.example.org [192.0.2.200])
 by mx.recipient.example (Postfix) with ESMTPS id ARC001;
 ${randomDate()}
Received: from mail.sender.example (mail.sender.example [192.0.2.10])
 by lists.example.org (Postfix) with ESMTPS id ARC000;
 ${randomDate()}
List-Id: <tech-share.lists.example.org>
List-Post: <mailto:tech-share@lists.example.org>

皆さん

新しいフレームワークを検証したので共有します。

性能が従来比2倍になったので、次期プロジェクトでの採用を検討しています。
詳細は社内Wikiをご確認ください。

コメントお待ちしています。
`,
  },

  // ========================================
  // 14. 複雑な経路（多ホップ）
  // ========================================
  {
    id: 'path-complex',
    name: '複雑な転送経路',
    description: '多数のサーバーを経由した複雑な経路。遅延・改ざんリスク',
    category: 'auth',
    dangerLevel: 2,
    features: ['経路可視化', 'Receivedヘッダー解析', 'ホップ数分析'],
    content: `From: sender@international.example
To: recipient@japan.example
Subject: 国際転送メールのサンプル
Date: ${randomDate()}
Message-ID: ${randomMessageId('international.example')}
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
Authentication-Results: mx.japan.example;
 spf=pass smtp.mailfrom=international.example;
 dkim=pass header.d=international.example;
 dmarc=pass header.from=international.example
Received: from gateway.japan.example (gateway.japan.example [192.0.2.1])
 by mx.japan.example (Postfix) with ESMTPS id PATH006
 for <recipient@japan.example>; ${randomDate()}
Received: from relay-asia.cdn.example (relay-asia.cdn.example [192.0.2.2])
 by gateway.japan.example (Postfix) with ESMTPS id PATH005;
 ${randomDate()}
Received: from relay-eu.cdn.example (relay-eu.cdn.example [192.0.2.3])
 by relay-asia.cdn.example (Postfix) with ESMTPS id PATH004;
 ${randomDate()}
Received: from relay-us.cdn.example (relay-us.cdn.example [192.0.2.4])
 by relay-eu.cdn.example (Postfix) with ESMTPS id PATH003;
 ${randomDate()}
Received: from outbound.international.example (outbound.international.example [192.0.2.5])
 by relay-us.cdn.example (Postfix) with ESMTPS id PATH002;
 ${randomDate()}
Received: from mail.international.example (mail.international.example [192.0.2.6])
 by outbound.international.example (Postfix) with ESMTPS id PATH001;
 ${randomDate()}

このメールは複数の国を経由して配送されています。

経路：
1. 送信サーバー（米国）
2. アウトバウンドゲートウェイ（米国）
3. CDNリレー（米国）
4. CDNリレー（欧州）
5. CDNリレー（アジア）
6. ゲートウェイ（日本）
7. 受信サーバー（日本）

各ホップでの遅延を確認できます。
`,
  },

  // ========================================
  // 15. 超危険コンボ（全部入り）
  // ========================================
  {
    id: 'combo-ultimate-danger',
    name: '超危険メール（全部入り）',
    description: '認証失敗+偽装ドメイン+BEC+危険添付+怪しいリンク',
    category: 'combo',
    dangerLevel: 5,
    features: ['すべての検知機能', '総合セキュリティスコア', '複合リスク分析'],
    content: `From: "社長 山田太郎" <ceo@rnicr0soft.com>
To: keiri-bucho@company.co.jp
Subject: 【至急・極秘】緊急振込依頼
Date: ${randomDate()}
Message-ID: ${randomMessageId('rnicr0soft.com')}
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="----=_DANGER_ZONE"
Authentication-Results: mx.company.co.jp;
 spf=fail smtp.mailfrom=rnicr0soft.com;
 dkim=fail header.d=rnicr0soft.com;
 dmarc=fail header.from=rnicr0soft.com
Received: from evil-server.tk (evil-server.tk [198.51.100.666])
 by mx.company.co.jp (Postfix) with ESMTP id DANGER01;
 ${randomDate()}

------=_DANGER_ZONE
Content-Type: text/html; charset=UTF-8

<html>
<body style="font-family: sans-serif;">
<p>経理部長 様</p>

<p style="color: red; font-weight: bold;">【極秘・至急】</p>

<p>今、海外出張中で電話に出られません。</p>

<p>取引先への<strong>緊急の支払い</strong>が必要です。<br>
本日17時までに以下の口座へ<strong>3,000万円</strong>を振り込んでください。</p>

<p>
銀行名：フェイク銀行<br>
口座番号：9999999<br>
名義：オレオレサギ
</p>

<p>または、<strong>Amazonギフトカード</strong>で50万円分購入し、<br>
コード写真をこのメールに返信してください。</p>

<p>詳細は添付ファイルを確認してください（パスワード: 1234）</p>

<p>
<a href="https://bit.ly/danger123">👉 振込フォーム</a><br>
<a href="http://192.168.1.100:8080/form">👉 予備リンク</a><br>
<a href="https://micr0soft.com.evil.tk/verify">👉 本人確認</a>
</p>

<p style="color: red;">
※ この件は他の誰にも言わないでください<br>
※ 電話での確認は不要です<br>
※ 返信せずにすぐ実行してください
</p>

<p>
代表取締役社長<br>
山田 太郎
</p>
</body>
</html>

------=_DANGER_ZONE
Content-Type: application/x-msdownload; name="振込依頼書.pdf.exe"
Content-Disposition: attachment; filename="振込依頼書.pdf.exe"
Content-Transfer-Encoding: base64

TVqQAAMAAAAEAAAA//8AALgAAAAAAAA=

------=_DANGER_ZONE
Content-Type: application/vnd.ms-excel.sheet.macroEnabled.12; name="口座情報.xlsm"
Content-Disposition: attachment; filename="口座情報.xlsm"
Content-Transfer-Encoding: base64

UEsDBBQAAAAIAAAAAAAAAAAAAAAAAAAA=

------=_DANGER_ZONE--
`,
  },
];

/**
 * ランダムなサンプルを取得
 */
export function getRandomSample(): SampleEml {
  const index = Math.floor(Math.random() * sampleEmls.length);
  return sampleEmls[index];
}

/**
 * カテゴリでフィルタ
 */
export function getSamplesByCategory(category: SampleEml['category']): SampleEml[] {
  return sampleEmls.filter(s => s.category === category);
}

/**
 * 危険レベルでフィルタ
 */
export function getSamplesByDangerLevel(minLevel: number): SampleEml[] {
  return sampleEmls.filter(s => s.dangerLevel >= minLevel);
}

/**
 * EMLコンテンツをBlobに変換
 */
export function createEmlBlob(sample: SampleEml): Blob {
  return new Blob([sample.content], { type: 'message/rfc822' });
}

/**
 * EMLファイルをダウンロード（Worker API経由）
 *
 * Worker APIを使って一時トークンを発行し、ブラウザでダウンロード
 * Worker APIが利用できない場合はフォールバックとしてBlobを使用
 */
export async function downloadSample(sample: SampleEml): Promise<void> {
  try {
    // 動的インポートでAPI関数を取得（循環参照回避）
    const { exportStringAsFile } = await import('../utils/api');
    await exportStringAsFile(sample.content, `${sample.id}.eml`, 'message/rfc822');
  } catch (error) {
    console.error('Worker API download failed, falling back to Blob:', error);
    // フォールバック: クライアント側でBlobを使用
    downloadSampleSync(sample);
  }
}

/**
 * EMLファイルをダウンロード（同期版・フォールバック用）
 */
export function downloadSampleSync(sample: SampleEml): void {
  const blob = createEmlBlob(sample);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sample.id}.eml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * ランダムサンプルをダウンロード
 */
export async function downloadRandomSample(): Promise<SampleEml> {
  const sample = getRandomSample();
  await downloadSample(sample);
  return sample;
}
