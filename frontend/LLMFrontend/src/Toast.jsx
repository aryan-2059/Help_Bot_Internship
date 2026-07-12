import React, {useEffect} from 'react';

export default function Toast({msg, type, onDone}){
    useEffect(()=>{
        if (!msg) return;
        const timer = setTimeout(onDone, 3500);
        return () => clearTimeout(timer);
    }, [msg,onDone])

    if(!msg) return null;

    return (
        <div className={`toast toast--${type}`}>{msg}</div>
    )
}