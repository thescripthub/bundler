const ver = "v2.1.1";

const childProcess = require("child_process");
const path = require("path");
const fs = require("fs-extra");

const currentTimestamp = new Date().getTime() / 1000;

let config; // setting config
if (fs.existsSync("settings.json")) {
	config = JSON.parse(fs.readFileSync("settings.json").toString());
}

// console colors
// i could use chalk but this is less effort 😈
const tags = {
	reset: "\x1b[0m",
	error: `\x1b[38;5;250m[\x1b[38;5;197mERROR\x1b[38;5;250m]\x1b[38;5;161m `,
	warn: `\x1b[38;5;250m[\x1b[38;5;220mWARNING\x1b[38;5;250m]\x1b[38;5;229m `,
	info: `\x1b[38;5;250m[\x1b[38;5;231mINFO\x1b[38;5;250m]\x1b[0m `,
	success: `\x1b[38;5;250m[\x1b[38;5;120mSUCCESS\x1b[38;5;250m]\x1b[0m `,
	variable: `\x1b[38;5;123m`,
	red: `\x1b[38;5;197m`,
};

let logConsole;
if (config.verboseLogs === true) {
	logConsole = function (message) {
		console.log(tags.info + message + tags.reset);
	};
} else {
	logConsole = function () {}; // this is amazing and definitely not bad practice
}

console.log(tags.red + `Negrobundler ${ver}\n` + tags.reset);

// funny regexes
const parenMatch = `\\s*\\(\\s*(?:(?:'|"|\\[\\[)(.+?)(:?'|"|\\]\\])|(.+?))?\\s*\\)`;

const importDir = new RegExp(config.keywordDirectory + parenMatch, "g");
const importRaw = new RegExp(config.keywordSingleRaw + parenMatch, "g");
const importMulti = new RegExp(config.keywordMulti + parenMatch, "g");
const importSingle = new RegExp(config.keywordSingle + parenMatch, "g");
const impbuildnumber = new RegExp(config.keywordBuildTimestamp + parenMatch, "g");
const importDirThreaded = new RegExp(config.keywordDirectoryThreaded + parenMatch, "g");

// indentation stuff
const singleTab = " ".repeat(config.tabLength);

function indentString(text, indentSize) {
	const tabs = singleTab.repeat(indentSize);

	return text.split(/\n/).join("\n" + tabs); // theres prob a better method than this but i couldnt find anything
}

// normally i'd inline this but i wont since there'll prob be tons of changes
function getIndentAmnt(contents, importStatement) {
	let indentCount = 1;

	if (config.smartIndents === true) {
		const location = contents.indexOf(importStatement); // the position of the statement

		// i'm sure theres a better method to find the line # a substring is in
		// but i couldn't find any other reliable method

		const prevText = contents.substring(0, location); // all the text before the statement

		const lines = prevText.split("\n");
		const thisLine = lines[lines.length - 1]; // the line

		const tabMatch = thisLine.match(/^([^\S\r\n])*/g);

		if (tabMatch) {
			const whitespace = tabMatch[0];
			indentCount += whitespace.length / config.tabLength;
		}
	}

	return indentCount;
}

// Process with Darklua - Thrown up here for consistency
function darkluaProcess(configFile) {
	childProcess.execFile("darklua", [ "process", "--config", configFile, config.outputFile, config.outputFile ], (error, stdout, stderr) => {
		if (error) {
			console.log(tags.warn + "failed; using default output instead" + tags.reset);
			console.log(tags.error + "Error: " + error + tags.reset);
		}
	});
}

// this is unnecessary but makes the packer source infinitely more easy to understand
class stringBuilder {
	constructor() {
		this.str = "";
	}

	indent(amount = 1) {
		this.str += `\n${singleTab.repeat(amount)}`;
		return this;
	}

	line(text = "") {
		this.str += `${text}\n`;
		return this;
	}

	text(text) {
		this.str += text;
		return this;
	}

	reset() {
		this.str = "";
		return this;
	}

	result() {
		return this.str;
	}
}

// the packer class is unnecessary but also makes things easier (atleast for me) so im leaving it in
class Packer {
	constructor() {
		this.imported = []; // keeps track of what file directories were already parsed
	}

	// Returns if this Packer has imported the file
	isPathImported(file) {
		return config.redundantImporting ? false : this.imported.includes(file);
	}

	// Parses any import keywords found in a file, returns formatted contents
	parseFile(filePath, basePath = ".") {
		let targetPath = path.resolve(basePath, filePath);
		
		if (!fs.existsSync(filePath) && config.baseDir) {
			const potentialPath = path.join(config.baseDir, filePath);
			
			if (fs.existsSync(potentialPath)) {
				targetPath = potentialPath;
			}
		}

		targetPath = path.relative(".", targetPath);

		const fileExists = fs.existsSync(targetPath);
		const fileImported = this.isPathImported(targetPath);
		const fileIsFile = fileExists && fs.lstatSync(targetPath).isFile();

		if (!fileExists) {
			console.log(tags.error + `Failed to find the file "${targetPath}"`);

			return {
				status: false,
				result: 1,
			};
		}

		if (fileImported && !config.redundantImporting) {
			console.log(tags.warn + `File "${targetPath}" was already imported`);

			return {
				status: false,
				result: 2,
			};
		}

		if (!fileIsFile) {
			console.log(tags.error + `Attempted to import the directory "${targetPath}"`);

			return {
				status: false,
				result: 3,
			};
		}

		this.imported.push(targetPath);

		let contents = fs.readFileSync(targetPath).toString();
		const builder = new stringBuilder();

		// Raw Import
		{
			for (const match of contents.matchAll(importRaw)) {
				const importStatement = match[0]; // the entire import statement ( ex. a('b/c.luau') )
				const importPath = match[1]; // the file path within the statement ( ex. b/c.luau )

				const indentCount = getIndentAmnt(contents, importStatement) - 1;

				const { status, result } = this.parseFile(importPath, path.dirname(targetPath));

				if (!status) {
					switch (result) {
						case 1:
							builder.text(`-- Failed to find the file "${importPath}"`);
							break;
						case 2:
							builder.text(`-- File "${importPath}" was already imported`);
							break;
						case 3:
							builder.text(`-- Attempted to import a directory ("${importPath}"), which is not a file!`);
							break;
						default:
							builder.text(`-- An unknown error occured - "${importPath}"`);
							break;
					}

					contents = contents.replace(importStatement, builder.result());
					builder.reset();

					continue;
				}

				const importCnts = indentString(result, indentCount);
				if (config.fileComments) {
					builder.text(`-- ${importPath}`);
				}
				builder.indent(indentCount);
				builder.text(importCnts);

				const finalStr = builder.result().replaceAll("$", "$$$$"); // i love javascript!!
				contents = contents.replace(importStatement, finalStr);

				builder.reset();
			}
		}

		// Single imports (rewritten)
		{
			for (const match of contents.matchAll(importSingle)) {
				const importStatement = match[0]; // the entire import statement ( ex. a('b/c.luau') )
				const importPath = match[1]; // the file path within the statement ( ex. b/c.luau )

				const indentCount = getIndentAmnt(contents, importStatement);

				const { status, result } = this.parseFile(importPath, path.dirname(targetPath));

				if (!status) {
					builder.text("(function() end)() -- ");

					switch (result) {
						case 1:
							builder.text(`Failed to find the file "${importPath}"`);
							break;
						case 2:
							builder.text(`File "${importPath}" was already imported`);
							break;
						case 3:
							builder.text(`Attempted to import a directory ("${importPath}"), which is not a file!`);
							break;
						default:
							builder.text(`An unknown error occured - "${importPath}"`);
							break;
					}

					contents = contents.replace(importStatement, builder.result());
					builder.reset();

					continue;
				}

				const importCnts = indentString(result, indentCount);
				builder.text("(function() ");
				if (config.fileComments) {
					builder.text(`-- ${importPath}`);
				}
				builder.indent(indentCount);
				builder.text(importCnts);
				builder.indent(indentCount - 1).text("end)()");

				const finalStr = builder.result().replaceAll("$", "$$$$"); // i love javascript!!
				contents = contents.replace(importStatement, finalStr);

				builder.reset();
			}
		}

		// Multi imports (rewritten)
		{
			for (const match of contents.matchAll(importMulti)) {
				const importStatement = match[0]; // the entire import statement ( ex. a('b/c.luau') )
				let importPath = match[1]; // the file path within the statement ( ex. b/c.luau )

				if (!importPath.endsWith("/")) {
					importPath += "/";
				}

				if (!fs.existsSync(importPath)) {
					console.log(tags.error + `Failed to find the directory "${importPath}"`);

					builder.text(`(function() end)() -- ` + `Failed to find the directory "${importPath}"`);
					contents = contents.replace(importStatement, builder.result());

					builder.reset();
					continue;
				}

				if (fs.lstatSync(importPath).isFile()) {
					console.log(tags.error + `Attempted to import the file "${importPath}"`);
					builder.text(
						`(function() end)() -- ` +
							`Attempted to import a file ("${importPath}"), which is not a directory!`,
					);
					contents = contents.replace(importStatement, builder.result());

					builder.reset();
					continue;
				}

				const indentCount = getIndentAmnt(contents, importStatement);
				const dirFiles = fs.readdirSync(importPath);

				if (dirFiles.length > 0) {
					for (const file of dirFiles) {
						if (path.extname(file) == "luau" || path.extname(file) == "lua") {
							continue;
						}

						const fullPath = importPath + file;
						const { status, result } = this.parseFile(fullPath, path.dirname(targetPath));

						if (!status) {
							continue;
						}

						const importCnts = indentString(result, indentCount);

						builder.text("(function() ");
						if (config.fileComments) {
							builder.text(`-- ${fullPath}`);
						}
						builder.indent(indentCount);
						builder.text(importCnts);

						builder.indent(indentCount - 1).text("end)(), ");
					}

					const finalStr = builder.result().slice(0, -2).replaceAll("$", "$$$$");
					contents = contents.replace(importStatement, finalStr);

					builder.reset();
				} else {
					console.log(tags.warn + `No files were found in the directory "${importPath}"`);

					builder.text(`(function() end)() -- ` + `No files were found in the directory "${importPath}"`);
					contents = contents.replace(importStatement, builder.result());

					builder.reset();
				}
			}
		}

		// Threaded Directory Imports
		{
			for (const match of contents.matchAll(importDirThreaded)) {
				const importStatement = match[0]; // the entire import statement ( ex. a('b/c.luau') )
				let importPath = match[1]; // the file path within the statement ( ex. b/c.luau )

				if (!importPath.endsWith("/")) {
					importPath += "/";
				}

				if (!fs.existsSync(importPath)) {
					console.log(tags.error + `Failed to find the directory "${importPath}"`);

					builder.text(`(function() end)() -- ` + `Failed to find the directory "${importPath}"`);
					contents = contents.replace(importStatement, builder.result());

					builder.reset();
					continue;
				}

				if (fs.lstatSync(importPath).isFile()) {
					console.log(tags.error + `Attempted to import the file "${importPath}"`);
					builder.text(
						`(function() end)() -- ` +
							`Attempted to import a file ("${importPath}"), which is not a directory!`,
					);
					contents = contents.replace(importStatement, builder.result());

					builder.reset();
					continue;
				}

				const indentCount = getIndentAmnt(contents, importStatement);
				const dirFiles = fs.readdirSync(importPath);

				if (dirFiles.length > 0) {
					builder.text("do ");
					if (config.fileComments) {
						builder.text(`-- ${importPath}`);
					}

					for (const file of dirFiles) {
						if (path.extname(file) == "luau" || path.extname(file) == "lua") {
							continue;
						}

						const fullPath = importPath + file;
						if (fullPath == config.inputFile) {
							console.log(tags.warn + "Attempted to recursively import the input file!" + tags.reset);
							continue;
						}

						const { status, result } = this.parseFile(fullPath, path.dirname(targetPath));

						if (!status) {
							continue;
						}

						const importCnts = indentString(result, indentCount + 1);

						builder.indent(indentCount).text("task.spawn(function() ");
						if (config.fileComments) {
							builder.text(`-- ${fullPath}`);
						}
						builder.indent(indentCount + 1);
						builder.text(importCnts);

						builder.indent(indentCount).text("end);");
					}
					builder.indent(indentCount - 1).text("end");

					const finalStr = builder.result().replaceAll("$", "$$$$");
					contents = contents.replace(importStatement, finalStr);

					builder.reset();
				} else {
					console.log(tags.warn + `No files were found in the directory "${importPath}"`);

					builder.text(`(function() end)() -- ` + `No files were found in the directory "${importPath}"`);
					contents = contents.replace(importStatement, builder.result());

					builder.reset();
				}
			}
		}

		// Directory imports (rewritten)
		{
			for (const match of contents.matchAll(importDir)) {
				const importStatement = match[0]; // the entire import statement ( ex. a('b/c.luau') )
				let importPath = match[1]; // the file path within the statement ( ex. b/c.luau )

				const absoluteImportPath = path.resolve(importPath);

				if (!fs.existsSync(importPath)) {
					console.log(tags.error + `Failed to find the directory "${importPath}"`);

					builder.text(`(function() end)() -- ` + `Failed to find the directory "${importPath}"`);
					contents = contents.replace(importStatement, builder.result());

					builder.reset();
					continue;
				}

				if (fs.lstatSync(importPath).isFile()) {
					console.log(tags.error + `Attempted to import the file "${importPath}"`);
					builder.text(
						`(function() end)() -- ` +
							`Attempted to import a file ("${importPath}"), which is not a directory!`,
					);
					contents = contents.replace(importStatement, builder.result());

					builder.reset();
					continue;
				}

				const indentCount = getIndentAmnt(contents, importStatement);
				const dirFiles = fs.readdirSync(importPath);

				if (dirFiles.length > 0) {
					builder.text("do ");
					if (config.fileComments) {
						builder.text(`-- ${importPath}`);
					}

					for (const file of dirFiles) {
						if (path.extname(file) == "luau" || path.extname(file) == "lua") {
							continue;
						}

						const fullPath = path.join(importPath, file);

						if (fullPath == config.inputFile) {
							console.log(tags.warn + "Attempted to recursively import the input file!" + tags.reset);
							continue;
						}

						const { status, result } = this.parseFile(fullPath);

						if (!status) {
							continue;
						}

						const importCnts = indentString(result, indentCount + 1);

						builder.indent(indentCount).text("(function() ");
						if (config.fileComments) {
							builder.text(`-- ${fullPath}`);
						}
						builder.indent(indentCount + 1);
						builder.text(importCnts);

						builder.indent(indentCount).text("end)();");
					}
					builder.indent(indentCount - 1).text("end");

					const finalStr = builder.result().replaceAll("$", "$$$$");
					contents = contents.replace(importStatement, finalStr);

					builder.reset();
				} else {
					console.log(tags.warn + `No files were found in the directory "${importPath}"`);

					builder.text(`(function() end)() -- ` + `No files were found in the directory "${importPath}"`);
					contents = contents.replace(importStatement, builder.result());

					builder.reset();
				}
			}
		}

		{
			for (const match of contents.matchAll(impbuildnumber)) {
				const statement = match[0];

				builder.text(currentTimestamp.toString());

				contents = contents.replace(statement, builder.result());

				builder.reset();
			}
		}

		logConsole(`Parsed file "${targetPath}"`);

		return {
			status: true,
			result: contents,
		};
	}
}

const thisPacker = new Packer();
logConsole("Starting Bundling Process");

let { status, result } = thisPacker.parseFile(config.inputFile);
logConsole("Finished packing");

fs.outputFileSync(config.outputFile, result);

if (config.minify === true && config.releaseBuild === true) {
	console.log(tags.info + "Preparing Release Build" + tags.reset);
	darkluaProcess("scripts/release.json");
} else if (config.minify === true) {
	console.log(tags.info + "Preparing Debug Build" + tags.reset);
	darkluaProcess("scripts/debug.json");
} else {
	console.log(tags.info + "Minification disabled");
}

console.log(
	tags.success +
		`Successfully bundled ${tags.variable + thisPacker.imported.length + tags.reset} file(s) into ${tags.variable + config.outputFile + tags.reset}.`,
);
