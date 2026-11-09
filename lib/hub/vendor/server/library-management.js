export function orderedItems(items) {
    return [
        ...items
    ].sort((a, b)=>Number(!!b.pinned) - Number(!!a.pinned) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}
export function manageItem(items, id, operation, name) {
    const item = items.find((row)=>row.id === id);
    if (!item) throw new Error('管理对象不存在，请刷新列表。');
    if (operation === 'rename') {
        const next = typeof name === 'string' ? name.trim() : '';
        if (!next || next.length > 120) throw new Error('名称应为 1 至 120 个字符。');
        item.name = next;
    } else if (operation === 'pin') {
        item.pinned = !item.pinned;
        const group = orderedItems(items.filter((row)=>!!row.pinned === !!item.pinned && row.id !== id));
        group.unshift(item);
        group.forEach((row, index)=>{
            row.sortOrder = index;
        });
    } else if (operation === 'move-up' || operation === 'move-down') {
        const group = orderedItems(items.filter((row)=>!!row.pinned === !!item.pinned));
        const index = group.findIndex((row)=>row.id === id);
        const next = index + (operation === 'move-up' ? -1 : 1);
        if (next < 0 || next >= group.length) return item;
        [group[index], group[next]] = [
            group[next],
            group[index]
        ];
        group.forEach((row, index)=>{
            row.sortOrder = index;
        });
    } else throw new Error('不支持的管理操作。');
    item.updatedAt = new Date().toISOString();
    return item;
}
