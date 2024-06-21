import * as fs from "node:fs";
import * as merge from "merge";
import * as path from "node:path";
import * as semver from "semver";
import type { SemVer } from "semver";
import * as uuid from "uuid";
import cbMeta from "../package.json" with {type: "json"};
import maniSchema from "./manifest.schema.json" with {type: "json"};
import { Validator } from "jsonschema";
import { requireUncached } from "./utils.js";

function parseVer<T extends string|null>(verStr: T, self: SemVer): T extends string ? SemVer : null {
    if (verStr == null) {
        // @ts-ignore: Why this doesn't typecheck?
        return null;
    }
    else if (verStr == "self") {
        // @ts-ignore: Why?
        return self;
    }
    else {
        const ver = semver.parse(verStr);
        if (ver) {
            // @ts-ignore: Just why?
            return ver;
        }
        else {
            throw new Error(`Unparsable version: ${verStr}`);
        }
    }
}

type Triplet = string|[number, number, number];
function triplet(ver: SemVer): Triplet {
    if (ver.prerelease.length > 0) {
        return ver.toString();
    }
    else {
        return [ver.major, ver.minor, ver.patch];
    }
}

function parseIncl(incl: string|string[]): Set<string> {
    if (typeof incl === "string") {
        return new Set([incl]);
    }
    else {
        return new Set(incl);
    }
}

export type ModuleType
    = "resources"|"script"|"data"|"client_data"|"interface"|
      "world_template"|"skin_pack"|"javascript";

export class Module {
    description: string;
    type:        ModuleType;
    uuid:        ArrayLike<number>;
    version:     SemVer;
    include:     Set<string>;

    constructor(modSrc: any, selfVer: SemVer) {
        this.description = modSrc.description;
        this.type        = modSrc.type;
        this.uuid        = uuid.parse(modSrc.uuid);
        this.version     = parseVer(modSrc.version, selfVer)!;
        this.include     = parseIncl(modSrc.include);
    }

    get manifest() {
        return {
            description: this.description,
            type:        this.type,
            uuid:        uuid.stringify(this.uuid),
            version:     triplet(this.version)
        };
    }

    static create(modSrc: any, selfVer: SemVer): Module {
        switch (modSrc.type) {
        case "resources":      return new ResourcesModule(modSrc, selfVer);
        case "script":         return new ScriptModule(modSrc, selfVer);
        case "data":           return new ServerDataModule(modSrc, selfVer);
        case "client_data":    return new ClientDataModule(modSrc, selfVer);
        case "interface":      return new InterfaceModule(modSrc, selfVer);
        case "world_template": return new WorldTemplateModule(modSrc, selfVer);
        case "skin_pack":      return new SkinPackModule(modSrc, selfVer);
        case "javascript":     throw new Error(`"javascript" is a deprecated module type. Use "script" instead.`);
        default:               throw new Error(`Unknown module type: ${modSrc.type}`);
        }
    }
}
export class ResourcesModule extends Module {}
export class ScriptModule extends Module {
    language: string;
    entry:    string;

    constructor(modSrc: any, selfVer: SemVer) {
        super(modSrc, selfVer);
        this.language = modSrc.language;
        this.entry    = modSrc.entry;
    }

    override get manifest() {
        return {
            ...super.manifest,
            language: this.language,
            entry:    this.entry
        };
    }
}
export class ServerDataModule extends Module {}
export class ClientDataModule extends Module {}
export class InterfaceModule extends Module {}
export class WorldTemplateModule extends Module {}
export class SkinPackModule extends Module {}

export class Dependency {
    uuid?:       ArrayLike<number>;
    moduleName?: string;
    version:     SemVer;

    constructor(depSrc: any, selfVer: SemVer) {
        if (depSrc.uuid != null) {
            this.uuid = uuid.parse(depSrc.uuid);
        }
        else {
            this.moduleName = depSrc.module_name;
        }
        this.version = parseVer(depSrc.version, selfVer)!;
    }

    get manifest() {
        return {
            ...(this.uuid != null
                ? {uuid:        uuid.stringify(this.uuid)}
                : {module_name: this.moduleName          }),
            version: triplet(this.version)
        };
    }
}

export class Metadata {
    authors?:      string[];
    license?:      string;
    generatedWith: Map<string, SemVer[]>;
    url?:          string;

    constructor(metaSrc: any = {}, selfVer: SemVer) {
        this.authors       = metaSrc.authors;
        this.license       = metaSrc.license;
        this.generatedWith = new Map(
            Object.entries(metaSrc.generated_with ?? [])
                  .map(([name, vers]) => {
                      return [
                          name,
                          (vers as any).map((ver: string) => parseVer(ver, selfVer))
                      ];
                  }));
        this.url           = metaSrc.url;

        this.generatedWith.set("cicada-build", [parseVer(cbMeta.version, selfVer)]);
    }

    get manifest() {
        return {
            ...( this.authors != null
                 ? { authors: this.authors }
                 : {}
               ),
            ...( this.license != null
                 ? { license: this.license }
                 : {}
               ),
            ...( this.generatedWith.size > 0
                 ? { generated_with: Object.fromEntries(
                         Array.from(this.generatedWith.entries())
                              .map(([name, vers]) => [name, vers.map(ver => ver.toString())]))
                   }
                 : {}
               ),
            ...( this.url != null
                 ? { url: this.url }
                 : {}
               )
        };
    }
}

export enum PackType {
    BehaviorPack  = "BehaviorPack",
    ResourcePack  = "ResourcePack",
    SkinPack      = "SkinPack",
    WorldTemplate = "WorldTemplate"
}

export class Pack {
    name:                 string;
    uuid:                 ArrayLike<number>;
    description:          string;
    version:              SemVer;
    icon:                 string|null;
    minEngineVersion:     SemVer|null;

    baseGameVersion:      SemVer|null;
    lockTemplateOptions?: boolean;

    modules:              Module[];
    dependencies:         Dependency[];

    capabilities:         string[];
    metadata:             Metadata;
    // @ts-ignore: tsc can't conclude that this.type is always defined.
    type:                 PackType;

    archiveSubDir:        string|null;
    installDir:           string|null;

    constructor(packSrc: any, srcDir: string, selfVer: SemVer) {
        this.name                = packSrc.name;
        this.uuid                = packSrc.uuid;
        this.description         = packSrc.description;
        this.version             = parseVer(packSrc.version, selfVer)!;
        this.icon                = packSrc.icon ? path.resolve(srcDir, packSrc.icon) : null;
        this.minEngineVersion    = parseVer(packSrc.min_engine_version, selfVer);

        // These are specific to world templates.
        this.baseGameVersion     = parseVer(packSrc.base_game_version, selfVer);
        this.lockTemplateOptions = packSrc.lock_template_options;

        const modDefaults = {
            version: packSrc.version
        };
        this.modules = packSrc.modules.map((modSrc: any) => {
            return Module.create(merge.recursive(true, modDefaults, modSrc), selfVer);
        });

        // "dependencies" can either be an array or an object.
        this.dependencies = (() => {
            if (!packSrc.dependencies) {
                return [];
            }
            else if (packSrc.dependencies instanceof Array) {
                return packSrc.dependencies.map((depSrc: any) => new Dependency(depSrc, selfVer));
            }
            else {
                // An object is interpreted as {moduleName: version} pairs.
                return Object.entries(packSrc.dependencies).map(([name, version]) => {
                    return new Dependency({
                        module_name: name,
                        version
                    }, selfVer);
                });
            }
        })();

        this.capabilities = packSrc.capabilities ?? [];
        this.metadata     = new Metadata(packSrc.metadata, selfVer);

        if (this.modules.length == 0) {
            throw new Error("Packs must have at least one module");
        }
        for (const mod of this.modules) {
            if (mod instanceof ResourcesModule  ||
                mod instanceof ClientDataModule ||
                mod instanceof InterfaceModule) {
                this.type = PackType.ResourcePack;
                break;
            }
            else if (mod instanceof ScriptModule     ||
                     mod instanceof ServerDataModule) {
                this.type = PackType.BehaviorPack;
                break;
            }
            else if (mod instanceof SkinPackModule) {
                this.type = PackType.SkinPack;
            }
            else if (mod instanceof WorldTemplateModule) {
                this.type = PackType.WorldTemplate;
                break;
            }
            else {
                throw new Error(`Unknown module type: ${mod.type}`);
            }
        }

        this.archiveSubDir = null;
        this.installDir    = null;
    }

    stagePath(root: string): string {
        if (this.archiveSubDir != null) {
            return path.resolve(root, this.archiveSubDir);
        }
        else {
            return root;
        }
    }

    installRootPath(comMojangDir: string): string {
        switch (this.type) {
        case PackType.BehaviorPack:
            return path.resolve(comMojangDir, "development_behavior_packs");

        case PackType.ResourcePack:
            return path.resolve(comMojangDir, "development_resource_packs");

        case PackType.SkinPack:
            return path.resolve(comMojangDir, "development_skin_packs");

        case PackType.WorldTemplate:
            return path.resolve(comMojangDir, "world_templates");

        default:
            throw new Error(`Unknown pack type: ${this.type}`);
        }
    }

    installPath(comMojangDir: string): string {
        if (this.installDir != null) {
            return path.resolve(this.installRootPath(comMojangDir), this.installDir);
        }
        else {
            throw new Error("installDir is not set");
        }
    }

    get manifest() {
        return {
            format_version: 2,
            header: {
                name:        this.name,
                uuid:        this.uuid,
                description: this.description,
                version:     triplet(this.version),
                ...( this.minEngineVersion
                     ? { min_engine_version: triplet(this.minEngineVersion) }
                     : {}
                   ),
                ...( this.baseGameVersion
                     ? { base_game_version: triplet(this.baseGameVersion) }
                     : {}
                   ),
                ...( this.lockTemplateOptions != null
                     ? { lock_template_options: this.lockTemplateOptions }
                     : {}
                   )
            },
            modules: this.modules.map(m => m.manifest),
            ...( this.dependencies.length > 0
                 ? { dependencies: this.dependencies.map(d => d.manifest) }
                 : {}
               ),
            ...( this.capabilities.length > 0
                 ? { capabilities: this.capabilities }
                 : {}
               ),
            ...( Object.keys(this.metadata.manifest).length > 0
                 ? { metadata: this.metadata.manifest }
                 : {}
               )
        };
    }
}

interface Person {
    name:   string;
    email?: string;
    url?:   string;
}
function stringifyAuthor(person: string|Person): string {
    if (typeof person === "string") {
        return person;
    }
    else {
        let str = person.name;
        if (person.email) {
            str += ` <${person.email}>`;
        }
        if (person.url) {
            str += ` (${person.url})`;
        }
        return str;
    }
}

// THINKME: Do we really have to define this ourselves?
interface PkgMeta {
    author?:       string|Person;
    contributors?: (string|Person)[];
}
function mkAuthors(meta: PkgMeta): string[] {
    const authors = [];
    if (meta.author) {
        authors.push(stringifyAuthor(meta.author));
    }
    if (meta.contributors) {
        meta.contributors.forEach(p => authors.push(stringifyAuthor(p)));
    }
    return authors;
}

export class Project {
    name:    string;
    version: SemVer;
    packs:   Pack[];

    constructor(pkgJsonPath: string, manifestSrcBase: string) {
        const meta    = requireUncached(path.resolve(pkgJsonPath));
        const srcPath = fs.existsSync(manifestSrcBase + ".cjs" ) ? manifestSrcBase + ".cjs"
                      :                                            manifestSrcBase + ".js";
        const src     = requireUncached(path.resolve(srcPath));
        const srcDir  = path.dirname(srcPath);

        const v       = new Validator();
        const vResult = v.validate(src, maniSchema);
        if (!vResult.valid) {
            throw new TypeError(vResult.toString());
        }

        this.name     = meta.name;
        this.version  = semver.parse(meta.version)!;

        const defaults = {
            name:        meta.name,
            description: meta.description,
            version:     meta.version,
            metadata: {
                authors: mkAuthors(meta),
                license: meta.license,
                url:     meta.homepage
            }
        };
        const common   = merge.recursive(true, defaults, src.common || {});

        this.packs = src.packs.map((packSrc0: any) => {
            const packSrc = merge.recursive(true, common, packSrc0);
            return new Pack(packSrc, srcDir, this.version);
        });
        if (this.packs.length == 0) {
            throw new Error("A project must have at least one pack.");
        }

        const num_of: Map<PackType, number> = new Map();
        for (const pack of this.packs) {
            num_of.set(pack.type, (num_of.get(pack.type) ?? 0) + 1);
        }

        const idx_of: Map<PackType, number> = new Map();
        for (const pack of this.packs) {
            // THINKME: Maybe we should let users choose the name of this?
            const dirName = (() => {
                if (this.packs.length == 1) {
                    return this.name;
                }
                else {
                    const suffix = (() => {
                        switch (pack.type) {
                            case PackType.BehaviorPack:  return "bp";
                            case PackType.ResourcePack:  return "rp";
                            case PackType.SkinPack:      return "skins";
                            case PackType.WorldTemplate: return "wt";
                            default:
                                throw new Error(`Unknown pack type: ${pack.type}`);
                        }
                    })();

                    if (num_of.get(pack.type) == 1) {
                        return `${this.name}-${suffix}`;
                    }
                    else {
                        const idx = idx_of.get(pack.type) ?? 0;
                        idx_of.set(pack.type, idx + 1);
                        return `${this.name}-${suffix}-${idx}`;
                    }
                }
            })();
            pack.archiveSubDir = this.packs.length > 1 ? dirName : null;
            pack.installDir    = dirName;
        }
    }

    get archiveName(): string {
        const basename = `${this.name}-${this.version.toString()}`;
        if (this.packs.length > 1) {
            return basename + ".mcaddon";
        }
        else if (this.packs[0]!.type === PackType.WorldTemplate) {
            return basename + ".mctemplate";
        }
        else {
            return basename + ".mcpack";
        }
    }
}
