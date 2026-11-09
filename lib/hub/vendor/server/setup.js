export class SetupChecks {
    constructor(..._args){}
    start() {
        throw new Error('请在 DSH 设置中配置原生运行时');
    }
    status() {
        return {
            available: false
        };
    }
}
export const checkCodexAccount = async ()=>({
        available: false
    });
export const exportDshPlugin = async ()=>{
    throw new Error('当前已经运行在 DSH 插件内');
};
export const findInstalledDshBridge = async ()=>null;
