// Derived from marsma-101/dsh-trae-connect, MIT; see LICENSE.
import {createDecipheriv,createHash} from "node:crypto";
const SALT_A = Buffer.from([
	82, 9, 106, 213, 48, 54, 165, 56, 191, 64, 163, 158, 129, 243, 215, 251,
	124, 227, 57, 130, 155, 47, 255, 135, 52, 142, 67, 68, 196, 222, 233, 203,
	84, 123, 148, 50, 166, 194, 35, 61, 238, 76, 149, 11, 66, 250, 195, 78,
	8, 46, 161, 102, 40, 217, 36, 178, 118, 91, 162, 73, 109, 139, 209, 37,
]);
const SALT_B = Buffer.from([
	31, 221, 168, 51, 136, 7, 199, 49, 177, 18, 16, 89, 39, 128, 236, 95,
	96, 81, 127, 169, 25, 181, 74, 13, 45, 229, 122, 159, 147, 201, 156, 239,
	160, 224, 59, 77, 174, 42, 245, 176, 200, 235, 187, 60, 131, 83, 153, 97,
	23, 43, 4, 126, 186, 119, 214, 38, 225, 105, 20, 99, 85, 33, 12, 125,
]);

const STORAGE_KEY = "iCubeAuthInfo://icube.cloudide";
/** Fixed public client id Trae's own clients present at token exchange. */
const CLIENT_ID = "ono9krqynydwx5";
/** API/OAuth host for CN personal accounts (auth.py forces this for cn). */
const CN_API_HOST = "https://api.trae.cn";

/** Reminder shown when the scan finds no usable credential at all. */
export const SIGN_IN_HINT =
	"请确认 Trae 桌面程序已启动并登录过（扫描模型列表与路径期间需保持程序处于启动状态）；首次使用请先在 Trae 里完成一次登录";

function xorInto(a, b) {
	const out = Buffer.alloc(a.length);
	for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
	return out;
}

/** Decrypt one "tc" envelope into its plaintext JSON string. */
export function decryptStorageValue(base64Value) {
	const buffer = Buffer.from(base64Value, "base64");
	if (buffer.length < 38 + 64) throw new Error("trae-connect: tc envelope too short");
	const header = buffer.subarray(0, 6);
	const isTc = header[0] === 0x74 && header[1] === 0x63 &&
		header[2] === 0x05 && header[3] === 0x10 && header[4] === 0x00 && header[5] === 0x00;
	const isPrivate = header[0] === 18 && header[1] === 57 && header[2] === 32 &&
		header[3] === 32 && header[4] === 2 && header[5] === 3;
	if (!isTc && !isPrivate) {
		throw new Error(`trae-connect: unknown Trae encryption header ${header.toString("hex")}`);
	}
	const random = buffer.subarray(6, 38);
	const encrypted = buffer.subarray(38);
	const salt = isPrivate ? xorInto(SALT_A, SALT_B) : xorInto(SALT_A, SALT_B);
	const hashOfRandom = createHash("sha512").update(random).digest();
	const finalHash = createHash("sha512").update(Buffer.concat([hashOfRandom, salt])).digest();
	const key = finalHash.subarray(0, 16);
	const iv = finalHash.subarray(16, 32);
	const decipher = createDecipheriv("aes-128-cbc", key, iv);
	decipher.setAutoPadding(false);
	const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
	const storedHash = decrypted.subarray(0, 64);
	let body = decrypted.subarray(64);
	const pad = body[body.length - 1];
	if (pad >= 1 && pad <= 16 && body.length > pad) {
		let valid = true;
		for (let i = body.length - pad; i < body.length; i++) if (body[i] !== pad) { valid = false; break; }
		if (valid) body = body.subarray(0, body.length - pad);
	}
	const computed = createHash("sha512").update(body).digest();
	if (!storedHash.equals(computed)) throw new Error("trae-connect: Trae credential hash verification failed");
	return body.toString("utf8");
}
