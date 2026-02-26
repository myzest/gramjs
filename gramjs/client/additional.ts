// @ts-nocheck
import _ from "lodash";
import Database from "better-sqlite3";
import dayjs from "dayjs";
import moment from "moment-timezone";
import path from "path";
import fs from "fs";
import AdmZip from "adm-zip";
import iconv from "iconv-lite";
import * as crypto from "crypto";
import template from "string-template";
import codes from "iso-lang-codes";
import { parsePhoneNumber, isValidPhoneNumber } from "libphonenumber-js";
import { serializeGramjsSession } from "@mtcute/convert";
import {
    Api,
    sessions,
    crypto as curCrypto,
    extensions,
    TelegramClient,
    helpers,
} from "../";
import { IGE } from "../crypto/IGE";

import models from "./model.js";
const { sleep } = helpers;
const { StringSession } = sessions;
const { BinaryReader } = extensions;

export const defaultDc = {
    id: 1,
    ip: "149.154.175.57",
    ipAddress: "149.154.175.57",
    port: 443,
    ipv6: false,
};

export class StoreSession extends StringSession {
    constructor() {
        super();
        this.sessionInfo = {};
    }

    async init() {
        const isAlive = ["authKey", "dcId", "port", "serverAddress"].every(
            (i) => !!this.sessionInfo[i]
        );
        if (isAlive) {
            const { authKey, dcId, port, serverAddress } = this.sessionInfo;
            this._dcId = dcId;
            this._port = port;
            this._serverAddress = serverAddress;
            this._key = authKey;
        } else {
            this.setDC(defaultDc.id, defaultDc.ip, defaultDc.port);
        }
    }
}

export const formatInitParams = (list) => {
    const params = list.map((item) => {
        switch (item._) {
            case "jsonString":
                return new Api.JsonObjectValue({
                    key: item.key,
                    value: new Api.JsonString({
                        value: item.value,
                    }),
                });

            case "jsonNumber":
                return new Api.JsonObjectValue({
                    key: item.key,
                    value: new Api.JsonNumber({
                        value: item.value,
                    }),
                });

            case "jsonObject":
                return new Api.JsonObjectValue({
                    key: item.key,
                    value: new Api.JsonObject({
                        value: formatInitParams(item.value),
                    }),
                });
            default:
                break;
        }
    });
    return params;
};

export const getInitConnection = (sessionInfo) => {
    const {
        deviceToken,
        cFingerpting,
        installer,
        packageId,
        tzOffset,
        apiHash,
        apiId,
        langPack,
        appVersion,
        systemVersion,
        deviceModel,
        langCode,
        systemLangCode,
        perfCat,
    } = sessionInfo;

    const defaultInitConnectionParams = [
        {
            _: "jsonString",
            key: "device_token",
            value: deviceToken || "",
        },
        {
            _: "jsonString",
            key: "data",
            value: cFingerpting || tg4cFingerpting,
        },
        {
            _: "jsonString",
            key: "installer",
            value: installer || "",
        },
        {
            _: "jsonString",
            key: "package_id",
            value: packageId || "org.telegram.messenger",
        },
        {
            _: "jsonNumber",
            key: "tz_offset",
            value: Number(tzOffset || 0),
        },
        {
            _: "jsonNumber",
            key: "perf_cat",
            value: perfCat || _.random(1, 2),
        },
    ];

    const params = formatInitParams(defaultInitConnectionParams);

    const initRequest = {
        apiId,
        apiHash,
        langPack,
        langCode,
        systemLangCode,
        appVersion,
        systemVersion,
        deviceModel,
        params: new Api.JsonObject({
            value: params,
        }),
    };

    return initRequest;
};

export const saveStringSession = (data) => {
    const stringSession = serializeGramjsSession(
        _.assign({}, _.pick(data, ["dcId", "port", "ipAddress", "authKey"]), {
            ipv6: false,
        })
    );
    return stringSession;
};

export const cFingerpting =
    "49C1522548EBACD46CE322B6FD47F6092BB745D0F88082145CAF35E14DCC38E1";

export const defaultConfig = {
    cFingerpting,
    enablePushConnection: false,
    configPath: "/data/user/0/org.telegram.messenger/files",
    langCode: "en",
};

export function formatInputString(inputString) {
    let counter = 0;
    let list = [];
    const replacedString = inputString?.replace?.(/\{([^}]+)\}/g, () => {
        const result = "{" + counter + "}";
        counter++;
        return result;
    });
    const matches = inputString.match(/\{([^}]+)\}/g);
    if (matches) {
        // 提取匹配到的文本，去除花括号
        const extractedTexts = matches.map((match) =>
            match.substring(1, match.length - 1)
        );
        // 将数字根据非数字字符拆分成长度为2的数组
        list = extractedTexts.flatMap((text) => {
            const numbers = text.split(/[^0-9]+/).filter(Boolean); // 匹配非数字字符并拆分
            const result = [];
            for (let i = 0; i < numbers.length; i += 2) {
                result.push(numbers.slice(i, i + 2));
            }
            return result;
        });
    }
    return template(
        replacedString,
        list.map((rests) => _.random(...rests))
    );
}

export function formatProxyTemplate(proxy = {}) {
    const formatProxyData = _.forOwn(_.cloneDeep(proxy), (value, key, obj) => {
        obj[key] = formatInputString(String(value || ""));
    });
    return _.assign({}, formatProxyData, {
        password: String(_.get(formatProxyData, "password", "")),
        port: Number(_.get(formatProxyData, "port", 0)),
    });
}

export function formatProxy(proxy = {}) {
    return _.assign({}, formatProxyTemplate(proxy), {
        socksType: 5,
        timeout: 10,
    });
}

const getModel = () => {
    return models[_.random(0, models.length - 1)];
};

export const oldTelegram = () => {
    const { deviceBrand, deviceModel, model } = getModel();
    const conf = {
        ...defaultConfig,
        deviceBrand,
        deviceModel,
        model,
        apiHash: "014b35b6184100b085b0d0572f9b5103",
        apiId: 4,
        langPack: "android",
        appVersion: "10.13.2 (48509)",
        cFingerpting,
        systemVersion: `SDK ${_.random(28, 34)}`,
        installer: "com.google.android.packageinstaller",
        packageId: "org.telegram.messenger.web",
        deviceToken: "__FIREBASE_FAILED__",
    };
    return conf;
};

export function identifyTheDirectory(path) {
    const parts = _.split(path, "/");
    const directories = [];

    // Build each level of the path
    for (let i = 0; i < parts.length - 1; i++) {
        const dirPath = _.slice(parts, 0, i + 1).join("/") + "/";
        directories.push(dirPath);
    }

    return directories;
}

export const clearEmptyBy = (value) => {
    // 排除 null、undefined 和空字符串
    if (_.isNil(value) || value === "") {
        return false;
    }
    // 对于对象和数组，进一步检查是否为空
    if (_.isObject(value) && _.isEmpty(value)) {
        return false;
    }
    // 其他情况保留
    return true;
};

export function clearEmpty(obj) {
    return _.pickBy(obj, clearEmptyBy);
}

export function isValidInternationalPhoneNumber(phoneNumber) {
    // 正则表达式匹配以加号开头，随后是一个或多个数字的字符串
    return /^\+\d+$/.test(phoneNumber) && isValidPhoneNumber(phoneNumber);
}

export function getCountryByPhone(phone) {
    if (isValidInternationalPhoneNumber(phone)) {
        const parsedNumber = parsePhoneNumber(phone);
        return _.get(parsedNumber, "country");
    }
}

export function getLangCode(props) {
    const phone = _.get(props, "phone");
    const country = getCountryByPhone(phone);
    if (country) {
        const systemLangCodes = codes.findCountryLocales(country);
        if (!_.isEmpty(systemLangCodes)) {
            const index = _.random(0, systemLangCodes.length - 1);
            const systemLangCode =
                systemLangCodes?.[index]?.toLocaleLowerCase?.() || "en-us";
            const langCodes = codes.findCountryLanguages(country);
            const langCode = langCodes?.[index] || "en";
            const [timezone] = moment.tz.zonesForCountry(country, true);
            const offset = _.get(timezone, "offset");
            const option = {
                country,
                systemLangCode,
                systemLangPack: systemLangCode,
                langCode,
                tzOffset: offset ? offset * 60 : 10800,
            };

            return option;
        }
    }

    return {
        country,
        langCode: "en",
        systemLangCode: "en-us",
        systemLangPack: "en-us",
        tzOffset: 10800,
    };
}

export class AnalyzeTData {
    constructor(props) {
        const { buffers, phone, sessionInfo } = props;
        this.buffers = buffers;
        this.phone = phone;
        this.sessionInfo = sessionInfo;
    }

    run() {
        this.getTwoFa();
        const old_session_key = "data";
        const tDataList = _.filter(this.buffers, (item) =>
            _.get(item, "originalname", "").includes("tdata")
        );
        const tDataItem = _.minBy(tDataList, (item) =>
            _.size(item.originalname)
        );
        const tDataPath = _.get(tDataItem, "originalname", "");
        const partOneMd5 = this.tdesktopMd5(old_session_key).slice(0, 16);
        const tdesktopUserBasePath = tDataPath + partOneMd5;

        const pathKey = "key_" + old_session_key;
        const openPath = tDataPath + pathKey;
        const data = this.openTDesktopBuffer(openPath);
        const salt = this.tdesktopReadBuffer(data);
        if (salt.length !== 32) {
            throw new Error("Length of salt is wrong!");
        }
        const encryptedKey = this.tdesktopReadBuffer(data);
        const encryptedInfo = this.tdesktopReadBuffer(data);
        const hash = crypto
            .createHash("sha512")
            .update(salt)
            .update("")
            .update(salt)
            .digest();
        const passKey = crypto.pbkdf2Sync(hash, salt, 1, 256, "sha512");
        const key = this.tdesktopReadBuffer(
            this.tdesktopDecrypt(new BinaryReader(encryptedKey), passKey)
        );
        const info = this.tdesktopReadBuffer(
            this.tdesktopDecrypt(new BinaryReader(encryptedInfo), key)
        );
        const count = info.readUInt32BE();
        if (count !== 1) {
            throw new Error("Currently only supporting one account at a time");
        }
        const main = this.tdesktopOpenEncrypted(tdesktopUserBasePath, key);
        const magic = main.read(4).reverse().readUInt32LE();
        if (magic !== 75) {
            throw new Error("Unsupported magic version");
        }
        const final = new BinaryReader(this.tdesktopReadBuffer(main));
        final.read(12);
        final.read(4).reverse().readUInt32LE();
        const mainDc = final.read(4).reverse().readUInt32LE();
        const length = final.read(4).reverse().readUInt32LE();
        for (let i = 0; i < length; i++) {
            const dc = final.read(4).reverse().readUInt32LE();
            const authKey = final.read(256);
            if (dc === mainDc) {
                this.sessionInfo.dcId = mainDc;
                this.sessionInfo.authKey = authKey;
                this.sessionInfo.serverAddress = this.getServerAddress(mainDc);
                this.sessionInfo.port = 443;
                this.getDefaultParams();
            }
        }
    }

    openTDesktopBuffer(name) {
        const filesToTry = [];
        for (const i of ["0", "1", "s"]) {
            const existsItem = _.find(this.buffers, (item) =>
                _.get(item, "originalname", "").includes(name + i)
            );
            if (!_.isEmpty(existsItem)) {
                const buffer = _.get(existsItem, "buffer");
                filesToTry.push(new BinaryReader(buffer));
            }
        }

        return this.tdesktopOpenAfter(filesToTry);
    }

    tdesktopOpenAfter(filesToTry) {
        for (const fileToTry of filesToTry) {
            const magic = fileToTry.read(4).toString("utf-8");
            if (magic !== "TDF$") {
                console.error("WRONG MAGIC");
                continue;
            }
            const versionBytes = fileToTry.read(4);

            let data = fileToTry.read();
            const md5 = data.slice(-16).toString("hex");
            data = data.slice(0, -16);
            const length = Buffer.alloc(4);
            length.writeInt32LE(data.length, 0);
            const toCompare = Buffer.concat([
                data,
                length,
                versionBytes,
                Buffer.from("TDF$", "utf-8"),
            ]);
            const hash = crypto
                .createHash("md5")
                .update(toCompare)
                .digest("hex");
            if (hash !== md5) {
                throw new Error("Wrong MD5");
            }
            const result = new BinaryReader(data);
            return result;
        }
    }

    tdesktopReadBuffer(buffer) {
        const length = buffer.read(4).reverse().readInt32LE();
        const result =
            length > 0 ? buffer.read(length, false) : Buffer.alloc(0);
        return result;
    }

    tdesktopDecrypt(data, auth_key) {
        const message_key = data.read(16);
        const encrypted_data = data.read();
        const [aes_key, aes_iv] = this.calcKey(auth_key, message_key, false);
        const ige = new IGE(aes_key, aes_iv);
        const decrypted_data = ige.decryptIge(encrypted_data);

        if (
            message_key.toString("hex") !==
            this.sha1(decrypted_data).slice(0, 16).toString("hex")
        ) {
            throw new Error("msg_key mismatch");
        }
        return new BinaryReader(decrypted_data);
    }

    calcKey(authKey, msgKey, client) {
        const x = client ? 0 : 8;
        const sha1_a = this.sha1(
            Buffer.concat([msgKey, authKey.slice(x, x + 32)])
        );
        const sha1_b = this.sha1(
            Buffer.concat([
                authKey.slice(32 + x, 32 + x + 16),
                msgKey,
                authKey.slice(48 + x, 48 + x + 16),
            ])
        );
        const sha1_c = this.sha1(
            Buffer.concat([authKey.slice(64 + x, 64 + x + 32), msgKey])
        );
        const sha1_d = this.sha1(
            Buffer.concat([msgKey, authKey.slice(96 + x, 96 + x + 32)])
        );

        const aes_key = Buffer.concat([
            sha1_a.slice(0, 8),
            sha1_b.slice(8, 8 + 12),
            sha1_c.slice(4, 4 + 12),
        ]);
        const aes_iv = Buffer.concat([
            sha1_a.slice(8, 8 + 12),
            sha1_b.slice(0, 8),
            sha1_c.slice(16, 16 + 4),
            sha1_d.slice(0, 8),
        ]);

        return [aes_key, aes_iv];
    }

    tdesktopOpenEncrypted(fileName, tdesktopKey) {
        const f = this.openTDesktopBuffer(fileName);
        const data = this.tdesktopReadBuffer(f);
        const res = this.tdesktopDecrypt(new BinaryReader(data), tdesktopKey);
        const length = res.readInt(false);
        if (length > res.getBuffer().length || length < 4) {
            throw new Error("Wrong length");
        }
        return res;
    }

    tdesktopMd5(data) {
        let result = "";
        const hash = crypto.createHash("md5").update(data).digest("hex");
        for (let i = 0; i < hash.length; i += 2) {
            result += hash[i + 1] + hash[i];
        }
        return result.toUpperCase();
    }

    getServerAddress(dcId) {
        switch (dcId) {
            case 1:
                return "149.154.175.50";
            case 2:
                return "95.161.76.100";
            case 3:
                return "149.154.175.100";
            case 4:
                return "149.154.167.91";
            case 5:
                return "149.154.171.5";
            default:
                throw new Error("Invalid DC");
        }
    }

    sha1(buf) {
        return crypto.createHash("sha1").update(buf).digest();
    }

    getDefaultParams() {
        const phone = this?.phone?.replace?.(/^(\+)?(\d+)/, "+$2");
        this.sessionInfo = _.assign(
            {},
            this.sessionInfo,
            getLangCode({ phone }),
            {
                apiHash: "b18441a1ff607e10a989891a5462e627",
                apiId: 2040,
                langPack: "tdesktop",
                deviceToken: "__FIREBASE_FAILED__",
                systemVersion: "Windows 11",
                appVersion: "5.2.3 x64",
                deviceModel: "Desktop",
                langCode: "en",
                systemLangCode: "en-US",
                tzOffset: 28800,
                phone,
            }
        );
    }

    getTwoFa() {
        const passwordTwoFA = _.find(
            this.buffers,
            (item) =>
                ["password", "fa", "pwd"].some((name) =>
                    _.get(item, "originalname", "").toLowerCase().includes(name)
                ) && _.get(item, "originalname", "").includes("txt")
        );
        this.sessionInfo.password =
            _.get(passwordTwoFA, "buffer")
                ?.toString?.("utf8")
                ?.replace?.(/[\b\f\n\r\t\v]/g, "") || null;
    }
}

export function getDefaultJson(phoneNumber = "") {
    const phone = phoneNumber?.replace?.(/^(\+)?(\d+)/, "+$2");
    const defaultJsonObject = _.assign(
        {},
        oldTelegram(),
        getLangCode({ phone })
    );
    return defaultJsonObject;
}

export function formatJsonAndSession(props = {}) {
    let { session, json, remark } = props;

    if (!_.isEmpty(json) && Array.isArray(json)) {
        json = _.map(_.filter(json, Boolean), (item) => {
            let jsonObject = {};
            const originalname = iconv.decode(
                Buffer.from(_.get(item, "originalname", ""), "binary"),
                "utf-8"
            );
            const extname = path.extname(originalname);
            const sessionFile = path.basename(originalname, extname);

            try {
                jsonObject = _.mapKeys(
                    JSON.parse(_.get(item, "buffer", []).toString()),
                    (value, key) => _.camelCase(key)
                );
            } catch (error) {
                return {};
            }

            const phone = _.get(jsonObject, "phone", "")?.replace?.(
                /^(\+)?(\d+)/,
                "+$2"
            );
            const defaultJsonObject = getDefaultJson(phone);

            const {
                appId: apiId,
                appHash: apiHash,
                device: deviceModel,
                systemLangPack: systemLangCode,
                twoFa,
                sdk: systemVersion,
                deviceToken,
                langPack,
                tzOffset,
                appVersion,
                langCode,
                cFingerpting,
                installer,
                packageId,
                email,
                userId,
                password,
                password2Fa,
            } = jsonObject;

            let jsonBetterData = {
                sessionFile,
                phone: sessionFile || phone,
                apiId,
                apiHash,
                deviceModel,
                systemLangCode,
                deviceToken,
                langPack,
                tzOffset,
                appVersion,
                systemVersion,
                password: twoFa || password || password2Fa,
                langCode,
                cFingerpting,
                installer,
                packageId,
                email,
                userId,
            };

            jsonBetterData = _.mapValues(jsonBetterData, (value, key) => {
                return value || defaultJsonObject[key];
            });

            jsonBetterData.isUseProxy = 2;
            jsonBetterData.proxy = {};

            const sessionLength = Object.values(jsonBetterData).length;
            const nextSessionLength = _.filter(
                Object.values(jsonBetterData),
                clearEmptyBy
            ).length;

            if (sessionLength - nextSessionLength >= 5) {
                return {};
            }
            return jsonBetterData;
        });
    }

    if (!_.isEmpty(session) && Array.isArray(session)) {
        session = _.map(_.filter(session, Boolean), (item) => {
            const originalname = iconv.decode(
                Buffer.from(_.get(item, "originalname", ""), "binary"),
                "utf-8"
            );
            const extname = path.extname(originalname);
            const sessionFile = path.basename(originalname, extname);

            try {
                const buffer = _.get(item, "buffer", []);
                const db = new Database(buffer);
                let result = db.prepare("SELECT * FROM sessions").get();
                db.close();
                const currentTime = dayjs(new Date()).format(
                    "YYYY-MM-DD HH:mm:ss"
                );
                result = _.mapKeys(result, (value, key) => _.camelCase(key));
                const { authKey, port, dcId, serverAddress } = result;
                const sessionObject = {
                    sessionFile,
                    authKey,
                    port,
                    dcId,
                    serverAddress,
                    remark: remark || `${currentTime}-导入`,
                    accountStatus: 2,
                };

                if (_.isNil(authKey) || _.isNil(dcId)) {
                    return {};
                }

                // if (!serverAddress || !port) {
                //   const { ipAddress, port } = _.keyBy(androidDcList, 'id')[dcId] || {};
                //   sessionObject.serverAddress = ipAddress;
                //   sessionObject.port = port;
                // }

                const sessionLength = Object.values(sessionObject).length;
                const nextSessionLength = _.filter(
                    Object.values(sessionObject),
                    clearEmptyBy
                ).length;
                if (sessionLength - nextSessionLength >= 1) {
                    return {};
                }

                return sessionObject;
            } catch (error) {
                return {};
            }
        });
    }

    const sessions = _.values(
        _.merge(_.keyBy(session, "sessionFile"), _.keyBy(json, "sessionFile"))
    );

    const result = _.reduce(
        sessions,
        (result, item) => {
            if (!_.isEmpty(item) && !_.isNil(_.get(item, "authKey"))) {
                const defaultJsonObject = getDefaultJson(item.phone);
                const phone = _.get(
                    item,
                    "phone",
                    _.get(item, "sessionFile")
                )?.replace?.(/^(\+)?(\d+)/, "+$2");

                result.push(
                    _.assign(defaultJsonObject, item, {
                        phone,
                        country: getCountryByPhone(phone) || "未知",
                        remark,
                    })
                );
            }
            return result;
        },
        []
    );

    return result;
}

export function checkImportData(props = {}) {
    let { json = [], session = [], zip = [], tdata = [], remark } = props;

    const fileList = [...json, ...session, ...zip, ...tdata];

    //校验格式是否正确
    const isHaveCanResolve = ["session", "zip"]?.some((field) =>
        fileList?.some((item) => (item?.originalname || "")?.endsWith?.(field))
    );

    if (!isHaveCanResolve) {
        return {
            code: 403,
            msg: "请正确上传会话文件",
            info: {},
        };
    }

    if (!_.isEmpty(zip) && Array.isArray(zip)) {
        zip = _.flattenDeep(
            _.map(zip, (item) => {
                const buffer = _.get(item, "buffer", []);
                const zip = new AdmZip(buffer);
                const zipEntries = zip.getEntries();
                const zipFiles = _.map(zipEntries, (zipEntry) => {
                    const originalname = iconv.decode(
                        Buffer.from(_.get(zipEntry, "entryName", ""), "binary"),
                        "utf-8"
                    );
                    const ext = path.extname(originalname);
                    const sessionFile = path.basename(originalname, ext);
                    const buffer = zipEntry.getData();

                    return {
                        sessionFile,
                        buffer,
                        originalname,
                        size: buffer.length,
                        ext,
                    };
                });
                const groups = _.map(
                    _.groupBy(zipFiles, (item) => item.sessionFile),
                    (list) => {
                        return _.reduce(
                            list,
                            (pre, cur) => {
                                if (_.get(cur, "ext", "").endsWith("json")) {
                                    return _.assign({}, pre, {
                                        json: cur,
                                    });
                                }
                                if (_.get(cur, "ext", "").endsWith("session")) {
                                    return _.assign({}, pre, {
                                        session: cur,
                                    });
                                }
                                return pre;
                            },
                            {}
                        );
                    }
                );
                return formatJsonAndSession({
                    json: _.map(groups, "json", []),
                    session: _.map(groups, "session", []),
                    remark,
                });
            })
        );
    }

    if (!_.isEmpty(tdata) && Array.isArray(tdata)) {
        tdata = _.flattenDeep(
            _.map(tdata, (item) => {
                const buffer = _.get(item, "buffer", []);
                const zip = new AdmZip(buffer);
                const zipEntries = zip.getEntries();
                const zipFiles = _.map(zipEntries, (zipEntry) => {
                    let originalname = iconv.decode(
                        Buffer.from(_.get(zipEntry, "entryName", ""), "binary"),
                        "utf-8"
                    );
                    originalname = originalname?.replace?.(/\/{2,}/g, "/");
                    const ext = path.extname(originalname);
                    const sessionFile = path.basename(originalname, ext);
                    const buffer = zipEntry.getData();
                    return {
                        sessionFile,
                        buffer,
                        originalname,
                        size: buffer.length,
                        ext,
                        isDirectory: zipEntry.isDirectory,
                    };
                });

                let rootList = _.filter(zipFiles, (item) => !!item.isDirectory);

                if (_.isEmpty(rootList)) {
                    zipFiles.push(
                        ..._.map(
                            _.compact([
                                ...new Set(
                                    _.flattenDeep(
                                        _.map(zipFiles, (item) =>
                                            identifyTheDirectory(
                                                _.get(item, "originalname", "")
                                            )
                                        )
                                    )
                                ),
                            ]),
                            (originalname) => {
                                return {
                                    originalname,
                                    sessionFile: _.last(
                                        _.compact(_.split(originalname, "/"))
                                    ),
                                    isDirectory: true,
                                };
                            }
                        )
                    );
                    rootList = _.filter(zipFiles, (item) => !!item.isDirectory);
                }

                const tdataMaps = rootList.reduce((result, curItem) => {
                    const phone = _.get(curItem, "sessionFile", "");
                    const phoneNumber = phone?.replace?.(/^(\+)?(\d+)/, "+$2");
                    if (isValidInternationalPhoneNumber(phoneNumber)) {
                        result[phone] = _.filter(zipFiles, (item) =>
                            _.get(item, "originalname", "").includes(phone)
                        );
                    }
                    return result;
                }, {});

                const results = _.reduce(
                    _.entries(tdataMaps),
                    (all, [phone, buffers]) => {
                        try {
                            const newTData = new AnalyzeTData({
                                phone,
                                buffers,
                                sessionInfo: {
                                    remark,
                                    sessionFile: phone,
                                },
                            });
                            newTData.run();
                            all.push(_.get(newTData, "sessionInfo", {}));
                        } catch (error) {}
                        return all;
                    },
                    []
                );

                return results;
            })
        );
    }

    const sessions = _.uniqBy(
        _.merge(
            formatJsonAndSession({
                session,
                json,
                remark,
            }),
            zip,
            tdata
        ),
        "sessionFile"
    );

    return sessions;
}

export function getFileName(props = {}) {
    let { json = [], session = [], zip = [], tdata = [] } = props;
    const fileList = [...json, ...session, ...zip, ...tdata];
    let params = {
        sessionFile: "",
        extName: [],
    };
    _.forEach(fileList, (item) => {
        let originalname = _.get(item, "originalname", "");
        originalname = iconv.decode(
            Buffer.from(originalname, "utf8"), // 直接使用正确的编码方式
            "utf-8"
        );
        const extName = path.extname(originalname);
        const sessionFile = path.basename(originalname, extName);
        params.sessionFile = sessionFile;
        params.extName.push(extName);
    });
    params.extName = params.extName.join("|");
    return params;
}

export function formatErrorMessage(message) {
    return _.reduce(
        Object.entries(errorMsgMaps),
        (msg, [key, val]) =>
            message?.toLocaleLowerCase()?.indexOf?.(key.toLocaleLowerCase()) !==
            -1
                ? `${val}${message}`
                : msg,
        message
    );
}

export function getError(error) {
    const propertyNames = Object.getOwnPropertyNames(error);
    return _.reduce(
        propertyNames,
        (err, key) => _.assign({}, err, { [key]: error[key] }),
        {}
    );
}

export class CustomError extends Error {
    constructor(props) {
        const { msg } = props;
        super(msg); // 调用父类的constructor，设置错误消息
        _.assign(this, props);
    }
}

export async function clientDestroy(client) {
    try {
        await client?.disconnect?.();
        await client?.destroy?.();
        if (!!client?.disconnect && !client?.disconnected) {
            return await clientDestroy(client);
        }
    } catch (error) {
        if (!!client?.disconnect && !client?.disconnected) {
            return await clientDestroy(client);
        }
    }
}

export async function returnSingleSimpleClient(props) {
    let { sessionInfo = {} } = _.cloneDeep(props);
    let { phone, proxy } = sessionInfo;
    sessionInfo.phone = phone.replace(/^(\+)?(\d+)/, "+$2");
    const session = new StoreSession();
    sessionInfo = _.assign(
        {},
        oldTelegram(),
        getLangCode({ phone }),
        sessionInfo,
        {
            phone,
            proxy,
        }
    );

    if (!_.isEmpty(proxy)) {
        sessionInfo.proxy = formatProxy(proxy);
    } else {
        sessionInfo = _.omit(sessionInfo, ["proxy"]);
    }
    session.sessionInfo = sessionInfo;
    await session.init();
    const { apiHash, apiId } = sessionInfo;
    const client = new TelegramClient(session, apiId, apiHash, {
        ...sessionInfo,
        floodSleepThreshold: 5,
        connectionRetries: 1,
        requestRetries: 5,
        retryDelay: 0,
        useWSS: true,
    });
    client.sessionInfo = sessionInfo;
    client.setLogLevel("none");
    const initRequest = getInitConnection(sessionInfo);
    client._initRequest = new Api.InitConnection(initRequest);
    try {
        const preConnect = Date.now();
        const result = await Promise.race([client.connect(), sleep(50000)]);
        const curConnect = Math.ceil((Date.now() - preConnect) / 1000);
        console.log(`${phone}---使用${curConnect}秒连接客户端-${!!result}`);
        return client;
    } catch (error) {
        await clientDestroy(client);
        throw new CustomError(
            _.assign({}, getError(error), {
                phone,
            })
        );
    }
}

export async function createSingleSimpleClient(props) {
    let { sessionInfo = {}, callback } = _.cloneDeep(props);
    let { phone, proxy } = sessionInfo;
    sessionInfo.phone = phone.replace(/^(\+)?(\d+)/, "+$2");
    const session = new StoreSession();
    sessionInfo = _.assign(
        {},
        oldTelegram(),
        getLangCode({ phone }),
        sessionInfo,
        {
            phone,
            proxy,
        }
    );

    if (!_.isEmpty(proxy)) {
        sessionInfo.proxy = formatProxy(proxy);
    } else {
        sessionInfo = _.omit(sessionInfo, ["proxy"]);
    }
    session.sessionInfo = sessionInfo;
    await session.init();
    const { apiHash, apiId } = sessionInfo;
    const client = new TelegramClient(session, apiId, apiHash, {
        ...sessionInfo,
        floodSleepThreshold: 5,
        connectionRetries: 1,
        requestRetries: 5,
        retryDelay: 0,
        useWSS: true,
    });
    client.sessionInfo = sessionInfo;
    client.setLogLevel("none");
    const initRequest = getInitConnection(sessionInfo);
    client._initRequest = new Api.InitConnection(initRequest);
    try {
        const preConnect = Date.now();
        const connectResult = await Promise.race([
            client.connect(),
            sleep(60000),
        ]);
        const curConnect = Math.ceil((Date.now() - preConnect) / 1000);
        console.log(
            `${phone}---使用${curConnect}秒连接客户端-${!!connectResult}`
        );
        const result = await Promise.race([callback(client), sleep(140000)]);
        await clientDestroy(client);
        if (_.isNil(result)) {
            throw new CustomError({
                code: 504,
                msg: translate("TG呆滞时间过久"),
                info: {},
                phone,
            });
        }

        return _.assign({}, result, {
            phone,
        });
    } catch (error) {
        await clientDestroy(client);
        throw new CustomError(
            _.assign({}, getError(error), {
                phone,
            })
        );
    }
}

